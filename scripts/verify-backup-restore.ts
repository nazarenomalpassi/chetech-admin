import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { OPERATIONAL_TABLES, identityColumns } from "../src/app/api/backup/operational-export";
import { assertIsolatedTarget } from "./verify-backup-restore-core";
import { readVerifiedBackup } from "./backup-cli";
import { verifyRestoredApplication } from "./backup-restore-local-core";

type PgClient = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, any>[] }> };
const { Client } = createRequire(import.meta.url)("pg") as { Client: new (options: { connectionString: string }) => PgClient };
async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, mode: { type: "string", default: "exact" }, "database-url-env": { type: "string", default: "BACKUP_VERIFY_DATABASE_URL" } } });
  if (!values.file || !["exact", "schema"].includes(values.mode!)) throw new Error("Use --file and --mode exact|schema");
  const connectionString = process.env[values["database-url-env"]!] ?? "";
  assertIsolatedTarget(connectionString);
  const backup = await readVerifiedBackup(resolve(values.file));
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query("begin isolation level repeatable read read only");
    await db.query("set local statement_timeout = '60s'");
    await db.query("set local timezone = 'UTC'");
    if (values.mode === "exact") {
      const verified = await verifyRestoredApplication(db, backup);
      await db.query("rollback");
      console.log(JSON.stringify({ mode: "exact", checkedTables: verified.checkedTables, rowCount: verified.rowCount, idsVerified: true, checksumsVerified: true, checkedForeignKeys: verified.checkedForeignKeys, orphanCount: verified.orphanCount, fullDatabaseRestoreVerified: false, writes: 0 }));
      return;
    }
    let checked = 0;
    for (const spec of OPERATIONAL_TABLES) {
      const entry = backup.manifest.tables.find(table => table.table === spec.table)!;
      if (!entry || entry.availability === "not-deployed") continue;
      const columnsResult = await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = $1", [spec.table]);
      const columns = columnsResult.rows.map(row => String(row.column_name));
      const keys = identityColumns(spec.identity);
      if (keys.some(key => !columns.includes(key))) throw new Error(`${spec.table}: staging schema is missing`);
      const exportedColumns = [...new Set(backup.data[spec.table].flatMap(row => Object.keys(row)))];
      if (exportedColumns.some(column => !columns.includes(column))) throw new Error(`${spec.table}: staging columns are missing`);
      checked++;
    }
    await db.query("rollback");
    console.log(JSON.stringify({ mode: "schema", checkedTables: checked, schemaCompatible: true, operationalRowsVerified: false, fullDatabaseRestoreVerified: false, writes: 0 }));
  } finally { await db.end(); }
}
main().catch(error => {
  const safeReason = error instanceof Error && /^[a-z_]+: (restored row count mismatch|restored checksum mismatch|identity mismatch|checksum mismatch|foreign key orphan detected|staging schema is missing|staging columns are missing)$/.test(error.message) ? error.message : "Check private connection env, port 54339, prepared schema and restored artifact";
  console.error(`Staging verification failed: ${safeReason}. No credentials or row contents were logged.`);
  process.exitCode = 1;
});
