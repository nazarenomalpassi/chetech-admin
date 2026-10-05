import { checksum, identityColumns, type ExportRow, type OperationalExport } from "../src/app/api/backup/operational-export";
import { assertIsolatedTarget } from "./verify-backup-restore-core";

export type RestoreClient = { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, any>[] }> };
type ManifestTable = OperationalExport["manifest"]["tables"][number];
export type ForeignKey = { child_schema: string; child_table: string; child_columns: string[]; parent_schema: string; parent_table: string; parent_columns: string[]; match_type: string };

export function quoteIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Invalid restore identifier");
  return `"${value}"`;
}

export function assertLocalRestoreTarget(connectionString: string) {
  assertIsolatedTarget(connectionString);
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!/^chetech_restore_\d{8}(?:_[a-z0-9_]+)?$/.test(name)) throw new Error("Restore requires a disposable chetech_restore_YYYYMMDD database");
  return name;
}

export function assertLocalContainerBindings(ports: { HostIp: string; HostPort: string }[]) {
  if (ports.length !== 1 || ports[0].HostIp !== "127.0.0.1" || ports[0].HostPort !== "54339") throw new Error("Container must expose PostgreSQL only on agreed 127.0.0.1:54339");
}

export async function createNewRestoreDatabase(db: RestoreClient, database: string) {
  if (!/^chetech_restore_\d{8}(?:_[a-z0-9_]+)?$/.test(database)) throw new Error("Not a disposable restore database");
  const found = await db.query("select exists(select 1 from pg_database where datname=$1) as exists", [database]);
  if (found.rows[0]?.exists) throw new Error("Disposable restore database already exists; refusing to replace it");
  await db.query(`create database ${quoteIdentifier(database)} template template0`);
}

export async function assertEmptyDestination(db: RestoreClient) {
  const relations = await db.query("select n.nspname schema_name, c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind in ('r','p')");
  for (const relation of relations.rows) {
    const count = await db.query(`select count(*)::text as count from ${quoteIdentifier(relation.schema_name)}.${quoteIdentifier(relation.table_name)}`);
    if (Number(count.rows[0].count) !== 0) throw new Error(`${relation.table_name}: destination is not empty`);
  }
}

export function buildInsertBatch(table: string, rows: ExportRow[], columns: string[]) {
  if (!columns.length) throw new Error("Missing restore columns");
  const name = quoteIdentifier(table);
  const selection = columns.map(quoteIdentifier).join(", ");
  return {
    sql: `insert into public.${name} (${selection}) overriding system value select ${selection} from jsonb_populate_recordset(null::public.${name}, $1::jsonb)`,
    params: [JSON.stringify(rows)]
  };
}

export function compareRestoredRows(entry: Pick<ManifestTable, "table" | "identity" | "rowCount" | "sha256">, expected: ExportRow[], actual: ExportRow[]) {
  if (actual.length !== entry.rowCount) throw new Error(`${entry.table}: restored row count mismatch`);
  const keys = identityColumns(entry.identity);
  const identities = (rows: ExportRow[]) => rows.map(row => JSON.stringify(keys.map(key => row[key]))).sort();
  const expectedIds = identities(expected);
  const actualIds = identities(actual);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) throw new Error(`${entry.table}: identity mismatch`);
  const sha256 = checksum(actual);
  if (sha256 !== entry.sha256) throw new Error(`${entry.table}: checksum mismatch`);
  return { table: entry.table, rowCount: actual.length, idsVerified: true, identitySha256: checksum(actualIds), sha256 };
}

export function foreignKeyOrphanSql(key: ForeignKey) {
  if (!key.child_columns.length || key.child_columns.length !== key.parent_columns.length) throw new Error("Invalid foreign key metadata");
  const child = `${quoteIdentifier(key.child_schema)}.${quoteIdentifier(key.child_table)}`;
  const parent = `${quoteIdentifier(key.parent_schema)}.${quoteIdentifier(key.parent_table)}`;
  const nonNull = key.child_columns.map(column => `c.${quoteIdentifier(column)} is not null`).join(" and ");
  const matches = key.child_columns.map((column, index) => `p.${quoteIdentifier(key.parent_columns[index])} = c.${quoteIdentifier(column)}`).join(" and ");
  const partialNull = key.match_type === "f" ? ` or ((${key.child_columns.map(column => `c.${quoteIdentifier(column)} is null`).join(" or ")}) and (${key.child_columns.map(column => `c.${quoteIdentifier(column)} is not null`).join(" or ")}))` : "";
  return `select count(*)::text as count from ${child} c where ((${nonNull}) and not exists (select 1 from ${parent} p where ${matches}))${partialNull}`;
}

const foreignKeysSql = `select child_ns.nspname child_schema, child.relname child_table,
  parent_ns.nspname parent_schema, parent.relname parent_table, c.confmatchtype match_type,
  array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum, n) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.n) child_columns,
  array(select a.attname::text from unnest(c.confkey) with ordinality k(attnum, n) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum order by k.n) parent_columns
  from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_namespace child_ns on child_ns.oid=child.relnamespace
  join pg_class parent on parent.oid=c.confrelid join pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
  where c.contype='f' and child_ns.nspname='public'`;

export async function verifyRestoredApplication(db: RestoreClient, backup: OperationalExport) {
  const entries = backup.manifest.tables.filter(entry => entry.availability === "exported");
  const tables = [];
  for (const entry of entries) {
    const columns = [...new Set(backup.data[entry.table].flatMap(row => Object.keys(row)))];
    const selection = (columns.length ? columns : identityColumns(entry.identity)).map(quoteIdentifier).join(", ");
    const order = identityColumns(entry.identity).map(quoteIdentifier).join(", ");
    const result = await db.query(`select row_to_json(exported) payload from (select ${selection} from public.${quoteIdentifier(entry.table)} order by ${order}) exported`);
    tables.push(compareRestoredRows(entry, backup.data[entry.table], result.rows.map(row => row.payload)));
  }
  const covered = new Set(entries.map(entry => entry.table));
  const constraints = await db.query(foreignKeysSql);
  let checkedForeignKeys = 0;
  let externalForeignKeys = 0;
  for (const row of constraints.rows) {
    const key = row as ForeignKey;
    if (!covered.has(key.child_table)) continue;
    if (!(key.parent_schema === "public" && covered.has(key.parent_table)) && !(key.parent_schema === "auth" && key.parent_table === "users")) {
      externalForeignKeys++;
      continue;
    }
    const result = await db.query(foreignKeyOrphanSql(key));
    if (Number(result.rows[0].count) !== 0) throw new Error(`${key.child_table}: foreign key orphan detected`);
    checkedForeignKeys++;
  }
  return { tables, checkedTables: tables.length, rowCount: tables.reduce((total, table) => total + table.rowCount, 0), checkedForeignKeys, externalForeignKeys, orphanCount: 0 };
}

export async function restoreApplicationRows(db: RestoreClient, backup: OperationalExport, database: string) {
  if (!/^chetech_restore_\d{8}(?:_[a-z0-9_]+)?$/.test(database)) throw new Error("Not a disposable restore database");
  await db.query("begin");
  try {
    const current = await db.query("select current_database() as name");
    if (current.rows[0]?.name !== database) throw new Error("Restore connection does not match disposable database");
    await db.query("set local timezone = 'UTC'");
    await db.query("set local statement_timeout = '60s'");
    await db.query("set local log_min_error_statement = 'panic'");
    await db.query("set local log_error_verbosity = 'terse'");
    await assertEmptyDestination(db);
    const entries = backup.manifest.tables.filter(entry => entry.availability === "exported");
    for (const entry of entries) {
      const count = await db.query(`select count(*)::text as count from public.${quoteIdentifier(entry.table)}`);
      if (Number(count.rows[0].count) !== 0) throw new Error(`${entry.table}: destination is not empty`);
    }
    const authCount = await db.query("select count(*)::text as count from auth.users");
    if (Number(authCount.rows[0].count) !== 0) throw new Error("auth.users: destination is not empty");
    const always = await db.query("select count(*)::text as count from pg_trigger where tgenabled='A' and not tgisinternal");
    if (Number(always.rows[0].count) !== 0) throw new Error("Always-enabled triggers require separate restore review");
    await db.query("set local session_replication_role = replica");
    const profileIds = (backup.data.profiles ?? []).map(row => row.id);
    if (profileIds.length) await db.query("insert into auth.users(id) select value::uuid from jsonb_array_elements_text($1::jsonb)", [JSON.stringify(profileIds)]);
    for (const entry of entries) {
      const rows = backup.data[entry.table];
      if (!rows.length) continue;
      const metadata = await db.query("select column_name, is_generated from information_schema.columns where table_schema='public' and table_name=$1", [entry.table]);
      const generated = new Set(metadata.rows.filter(row => row.is_generated !== "NEVER").map(row => row.column_name));
      const known = new Set(metadata.rows.map(row => row.column_name));
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
      if (columns.some(column => !known.has(column))) throw new Error(`${entry.table}: restore column is missing`);
      const insertColumns = columns.filter(column => !generated.has(column));
      for (let from = 0; from < rows.length; from += 250) {
        const batch = buildInsertBatch(entry.table, rows.slice(from, from + 250), insertColumns);
        try { await db.query(batch.sql, batch.params); }
        catch { throw new Error(`${entry.table}: insert failed; no private row details logged`); }
      }
    }
    await db.query("set local session_replication_role = origin");
    const verification = await verifyRestoredApplication(db, backup);
    await db.query("commit");
    return { ...verification, authPlaceholders: profileIds.length, credentialsRestored: false, fullDatabaseRestoreVerified: false };
  } catch (error) { await db.query("rollback"); throw error; }
}
