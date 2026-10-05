import { execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { readVerifiedBackup } from "./backup-cli";
import { assertEmptyDestination, assertLocalContainerBindings, assertLocalRestoreTarget, createNewRestoreDatabase, restoreApplicationRows, type RestoreClient } from "./backup-restore-local-core";

const run = promisify(execFile);
type PgClient = RestoreClient & { connect(): Promise<void>; end(): Promise<void> };
const { Client } = createRequire(import.meta.url)("pg") as { Client: new (options: { connectionString: string }) => PgClient };
const CONTAINER = "chetech-staging-20261005";
const SOURCE_DATABASE = "chetech_staging";

async function docker(args: string[], phase: string) {
  try { return await run("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); }
  catch { throw new Error(`${phase} failed; Docker output was suppressed to protect private data`); }
}

function requirePrivatePath(path: string) {
  const child = relative(resolve("tmp/backups"), path);
  if (isAbsolute(child) || child === ".." || child.startsWith("../") || child.startsWith("..\\")) throw new Error("Restore artifact must stay under ignored tmp/backups");
}

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, "resume-empty": { type: "boolean", default: false }, "database-url-env": { type: "string", default: "BACKUP_RESTORE_DATABASE_URL" } } });
  if (!values.file) throw new Error("--file is required");
  const connectionString = process.env[values["database-url-env"]!] ?? "";
  const database = assertLocalRestoreTarget(connectionString);
  const file = resolve(values.file);
  requirePrivatePath(file);
  await run("git", ["check-ignore", "--quiet", "--", file]);
  const backup = await readVerifiedBackup(file);
  const inspection = await docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", CONTAINER], "Container identity check");
  const ports = JSON.parse(inspection.stdout)["5432/tcp"] ?? [];
  assertLocalContainerBindings(ports);
  const maintenanceUrl = new URL(connectionString);
  maintenanceUrl.pathname = "/postgres";
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() });
  await maintenance.connect();
  try {
    const source = await maintenance.query("select exists(select 1 from pg_database where datname=$1) as exists", [SOURCE_DATABASE]);
    if (!source.rows[0]?.exists) throw new Error("Local chetech_staging schema source is missing");
    if (!values["resume-empty"]) await createNewRestoreDatabase(maintenance, database);
  } finally { await maintenance.end(); }

  const artifactId = randomUUID();
  const directory = resolve("tmp/backups/local-restore", database);
  requirePrivatePath(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const containerArchive = `/tmp/chetech-schema-${artifactId}.dump`;
  let schemaPath = resolve(directory, `schema-${artifactId}.dump`);
  if (values["resume-empty"]) {
    const empty = new Client({ connectionString });
    await empty.connect();
    try { await assertEmptyDestination(empty); } finally { await empty.end(); }
    const archives = (await readdir(directory)).filter(name => /^schema-[a-f0-9-]+\.dump$/.test(name));
    if (archives.length !== 1) throw new Error("Resume requires exactly one private schema archive from the initial attempt");
    schemaPath = resolve(directory, archives[0]);
  } else {
    await docker(["exec", CONTAINER, "pg_dump", "--host=/var/run/postgresql", "--port=5432", "--username=postgres", `--dbname=${SOURCE_DATABASE}`, "--schema-only", "--format=custom", `--file=${containerArchive}`], "Read-only staging schema dump");
    await docker(["cp", `${CONTAINER}:${containerArchive}`, schemaPath], "Private schema archive copy");
    const listing = await docker(["exec", CONTAINER, "pg_restore", "--list", containerArchive], "Schema archive listing");
    if (/\bSCHEMA\s+-\s+public\b/.test(listing.stdout)) {
      const empty = new Client({ connectionString });
      await empty.connect();
      try { await empty.query("drop schema public"); } finally { await empty.end(); }
    }
    await docker(["exec", CONTAINER, "pg_restore", "--host=/var/run/postgresql", "--port=5432", "--username=postgres", `--dbname=${database}`, "--exit-on-error", "--single-transaction", containerArchive], "Fresh disposable schema restore");
  }
  const db = new Client({ connectionString });
  await db.connect();
  let restored;
  try { restored = await restoreApplicationRows(db, backup, database); } finally { await db.end(); }
  const report = {
    format: "chetech-local-application-restore", completedAt: new Date().toISOString(), container: CONTAINER,
    database, sourceSchemaDatabase: SOURCE_DATABASE, schemaOnlySourceRead: true,
    applicationArtifactSha256: createHash("sha256").update(await readFile(file)).digest("hex"),
    schemaArchiveSha256: createHash("sha256").update(await readFile(schemaPath)).digest("hex"),
    ...restored,
    sequencesRestored: false, storageObjectsRestored: false, productionWrites: 0
  };
  const reportPath = resolve(directory, `verified-${artifactId}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ database, checkedTables: report.checkedTables, rowCount: report.rowCount, checkedForeignKeys: report.checkedForeignKeys, orphanCount: report.orphanCount, idsAndChecksumsVerified: true, fullDatabaseRestoreVerified: false, reportPath, productionWrites: 0 }, null, 2));
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "Unknown restore failure";
  const safe = /^(Restore |Resume requires|Not a disposable|Disposable restore|Restore artifact|Container must|Local chetech|[a-z_]+: (destination is not empty|restored row count mismatch|identity mismatch|checksum mismatch|foreign key orphan detected|insert failed|restore column is missing))/.test(message) ? message : "Local restore failed; inspect schema compatibility and guarded target. Private diagnostics were suppressed";
  console.error(safe);
  process.exitCode = 1;
});
