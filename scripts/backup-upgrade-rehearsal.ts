import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readVerifiedBackup } from "./backup-cli";
import { verifyRestoredApplication } from "./backup-restore-local-core";
import { buildBaselineStatements, migrationBody, assertMigrationInventory, rowFingerprintSql } from "./backup-upgrade-rehearsal-core";

const { Client } = createRequire(import.meta.url)("pg");
const root = resolve("tmp/backups/release-upgrade-20261006");
const container = "chetech-staging-20261005";
const prefix = "chetech_restore_20261006_upgrade_";
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const url = (database: string) => `postgresql://postgres:chetech-local-test-20261005@127.0.0.1:54339/${database}`;
let phase = "validate isolated target";

async function main() {
  const bindings = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container], { encoding: "utf8" }))["5432/tcp"];
  if (bindings.length !== 1 || bindings[0].HostIp !== "127.0.0.1" || bindings[0].HostPort !== "54339") throw new Error("Not the isolated staging container");
  await mkdir(root, { recursive: true });
  execFileSync("git", ["check-ignore", "--quiet", "--", root + "/probe.json"]);
  const catalog = JSON.parse(await readFile(resolve(root, "production-catalog.json"), "utf8"));
  if (catalog.projectRef !== "ocdijruwaiwnmjmuvxzr" || catalog.productionWrites !== false && catalog.productionWrites !== 0) throw new Error("Unverified source catalog");
  const backup = await readVerifiedBackup(resolve("tmp/backups/release-20261006/operational-2026-10-06T13-01-28-866Z-fa7a530c.json"));
  const supplement = JSON.parse(await readFile(resolve(root, "public-supplement.json"), "utf8"));
  const extra = Object.fromEntries(Object.entries(supplement.tables).map(([table, value]: [string, any]) => {
    if (!Array.isArray(value.rows) || value.rowCount !== value.rows.length) throw new Error("Invalid supplemental row inventory");
    return [table, value.rows];
  }));
  const rows: Record<string, any[]> = { ...backup.data, ...extra };
  const migrations = assertMigrationInventory((await readdir("supabase/migrations")).filter(file => file.startsWith("20261005")));
  const base = "SET search_path=public,extensions;\n" + buildBaselineStatements(catalog, { phase: "base" }).join("\n");
  const relationships = buildBaselineStatements(catalog, { phase: "constraints" }).join("\n");
  const security = buildBaselineStatements(catalog, { phase: "security" }).join("\n");
  await writeFile(resolve(root, "baseline-schema.sql"), [base, relationships, security].join("\n"), { mode: 0o600 });
  const dbName = prefix + randomUUID().slice(0, 8);
  const maintenance = new Client({ connectionString: url("postgres") });
  await maintenance.connect();
  await maintenance.query(`create database ${quote(dbName)} template template0`);
  await maintenance.end();
  const db = new Client({ connectionString: url(dbName) });
  await db.connect();
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const applied: string[] = [];
  const roles = (backup.data.profiles ?? []).filter(row => row.role === "admin" || row.role === "tecnico");
  try {
    await db.query("set log_min_error_statement='panic'; set log_error_verbosity='terse'; set statement_timeout='120s'; set timezone='UTC'");
    phase = "reconstruct actual baseline";
    await db.query(base);
    phase = "restore public source rows without business triggers";
    const ids = new Set<string>();
    for (const fk of catalog.constraints.filter((x: any) => x.type === "f" && /REFERENCES auth.users\(id\)/.test(x.definition))) {
      const column = fk.definition.match(/FOREIGN KEY \(([^)]+)\)/)?.[1]?.replaceAll('"', "");
      if (!column || fk.schema !== "public") continue;
      for (const row of rows[fk.table_name] ?? []) if (row[column]) ids.add(row[column]);
    }
    for (const row of backup.data.profiles ?? []) ids.add(row.id as string);
    await db.query("insert into auth.users(id) select value::uuid from jsonb_array_elements_text($1::jsonb)", [JSON.stringify([...ids])]);
    for (const [table, data] of Object.entries(rows)) {
      if (!Array.isArray(data) || !data.length) continue;
      const fields = catalog.columns.filter((c: any) => c.schema === "public" && c.table_name === table && !c.generated);
      const names = fields.map((c: any) => c.name).filter((name: string) => data.some(row => name in row));
      if (!names.length) throw new Error("Unknown source table");
      const columns = names.map(quote).join(",");
      for (let start = 0; start < data.length; start += 250) {
        await db.query(`insert into public.${quote(table)} (${columns}) overriding system value select ${columns} from jsonb_populate_recordset(null::public.${quote(table)}, $1::jsonb)`, [JSON.stringify(data.slice(start, start + 250))]);
      }
    }
    phase = "restore relationships, actual RLS, triggers and grants";
    await db.query(relationships);
    await db.query(security);
    await verifyRestoredApplication(db, backup);
    await db.query("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text)");
    await db.query("insert into supabase_migrations.schema_migrations values('20261001141101','complete_repair_history_reads')");
    for (const table of catalog.tables.filter((x: any) => ["public", "private"].includes(x.schema) && x.kind === "r")) {
      before[`${table.schema}.${table.name}`] = (await db.query(rowFingerprintSql(catalog, table.schema, table.name))).rows;
    }
    const financeSql = await readFile("scripts/financial-production-snapshot.sql", "utf8");
    const readFinance = async () => {
      await db.query(financeSql.replace(/\brollback;\s*$/i, ""));
      const result = await db.query("select public.get_cash_page_snapshot('2026-10-06T00:00:00-03:00','2026-10-07T00:00:00-03:00')->'cash_summary' as cash, public.get_salary_planning_snapshot('2026-10-01')->'accounts' as accounts, public.get_salary_planning_snapshot('2026-10-01')->'total_available' as total_available");
      await db.query("rollback");
      return result.rows;
    };
    const financeBefore = await readFinance();
    phase = "archive baseline for rollback rehearsal";
    const archive = `/tmp/${dbName}.dump`;
    execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", dbName, "-Fc", "-f", archive], { stdio: "pipe" });
    execFileSync("docker", ["cp", `${container}:${archive}`, resolve(root, `${dbName}.dump`)], { stdio: "pipe" });
    phase = "apply release migrations in order";
    for (const file of migrations) {
      phase = `migration ${file}`;
      const body = migrationBody(await readFile(resolve("supabase/migrations", file), "utf8"));
      await db.query("begin; set local lock_timeout='5s'");
      try {
        await db.query(body);
        await db.query("insert into supabase_migrations.schema_migrations values($1,$2)", [file.slice(0, 14), file.slice(15, -4)]);
        await db.query("commit");
        applied.push(file);
      } catch (error) { await db.query("rollback"); throw error; }
    }
    phase = "compare every original column of existing public and private rows";
    for (const table of catalog.tables.filter((x: any) => ["public", "private"].includes(x.schema) && x.kind === "r")) {
      const key = `${table.schema}.${table.name}`;
      after[key] = (await db.query(rowFingerprintSql(catalog, table.schema, table.name))).rows;
      if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) throw new Error(`Historical row mismatch: ${key}`);
    }
    const financeAfter = await readFinance();
    if (JSON.stringify(financeBefore) !== JSON.stringify(financeAfter)) throw new Error("Cash or salary projection changed during upgrade");
    phase = "verify direct authenticated reads for actual roles";
    const roleChecks: any[] = [];
    for (const user of roles) {
      await db.query("begin; set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user.id, role: "authenticated" })]);
      const page = await db.query("select public.workshop_read_page() as data");
      const products = await db.query("select count(*)::int as count from public.products");
      roleChecks.push({ role: user.role, workshop: Boolean(page.rows[0].data), visibleProducts: products.rows[0].count });
      if (user.role === "tecnico" && products.rows[0].count !== 0) throw new Error("Technician cost-table boundary regressed");
      await db.query("rollback");
    }
    const guards = await db.query("select count(*)::int as missing_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");
    if (guards.rows[0].missing_rls) throw new Error("An exposed table is missing RLS");
    phase = "restore baseline archive into another fresh local database";
    const restored = dbName + "_rollback";
    const admin = new Client({ connectionString: url("postgres") });
    await admin.connect();
    await admin.query(`create database ${quote(restored)} template template0`);
    await admin.end();
    const emptyRollback = new Client({ connectionString: url(restored) });
    await emptyRollback.connect();
    const archiveList = execFileSync("docker", ["exec", container, "pg_restore", "--list", archive], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (/\bSCHEMA\s+-\s+public\b/.test(archiveList)) await emptyRollback.query("drop schema public");
    await emptyRollback.end();
    execFileSync("docker", ["exec", container, "pg_restore", "-U", "postgres", "-d", restored, "--exit-on-error", "--single-transaction", archive], { stdio: "pipe" });
    const rollback = new Client({ connectionString: url(restored) });
    await rollback.connect();
    for (const table of catalog.tables.filter((x: any) => ["public", "private"].includes(x.schema) && x.kind === "r")) {
      const actual = (await rollback.query(rowFingerprintSql(catalog, table.schema, table.name))).rows;
      if (JSON.stringify(actual) !== JSON.stringify(before[`${table.schema}.${table.name}`])) throw new Error("Baseline archive restore mismatch");
    }
    await rollback.end();
    const report = { completedAt: new Date().toISOString(), database: dbName, rollbackDatabase: restored, catalogSha256: createHash("sha256").update(JSON.stringify(catalog)).digest("hex"), applied, preservedOriginalTables: Object.keys(before).length, historicalRowsUnchanged: true, financialProjectionsUnchanged: true, roleChecks, restoredBaselineArchive: true, productionWrites: 0, fullPlatformRecovery: false, limitations: ["No Auth credentials or sessions restored", "No Storage file contents restored", "Supabase Vault extension not emulated"] };
    await writeFile(resolve(root, "verified-upgrade.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.end(); }
}

main().catch(async error => {
  const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
  await writeFile(resolve(root, "private-error.json"), JSON.stringify({ phase, code, message: error?.message, detail: error?.detail, where: error?.where }, null, 2), { mode: 0o600 }).catch(() => undefined);
  console.error(JSON.stringify({ verified: false, phase, code, privateDiagnosticsSuppressed: true, productionWrites: 0 }));
  process.exitCode = 1;
});
