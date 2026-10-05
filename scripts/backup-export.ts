import { execFileSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createOperationalExport } from "../src/app/api/backup/operational-export";
import { readBackupCredentials, writeBackupArtifacts } from "./backup-cli";

async function main() {
  const { values } = parseArgs({ options: { "env-path": { type: "string" }, "out-dir": { type: "string", default: "tmp/backups" }, "page-size": { type: "string", default: "500" } } });
  if (!values["env-path"]) throw new Error("An explicit --env-path is required");
  const envPath = resolve(values["env-path"]);
  const outDir = resolve(values["out-dir"]!);
  const privateRoot = resolve("tmp/backups");
  const child = relative(privateRoot, outDir);
  if (isAbsolute(child) || child === ".." || child.startsWith(`..\\`) || child.startsWith("../")) throw new Error("Output must be inside ignored tmp/backups");
  execFileSync("git", ["check-ignore", "--quiet", "--", joinForGit(outDir, "probe.json")], { stdio: "ignore" });
  const pageSize = Number(values["page-size"]);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Invalid --page-size");
  const credentials = await readBackupCredentials(envPath);
  const db = createClient(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  const backup = await createOperationalExport(db, { pageSize, sourceRevision: `${revision}${dirty ? ":dirty-workspace" : ""}` });
  const paths = await writeBackupArtifacts(backup, outDir);
  console.log(JSON.stringify({ ...paths, tableCount: backup.manifest.tables.filter(table => table.availability === "exported").length, notDeployed: backup.manifest.tables.filter(table => table.availability === "not-deployed").map(table => table.table), rowCount: backup.manifest.totalRows, fullDatabaseBackup: false }, null, 2));
}

function joinForGit(directory: string, file: string) { return `${directory.replace(/\\/g, "/")}/${file}`; }

main().catch(() => {
  console.error("Operational export failed. No verified backup is confirmed. Check explicit env-path, ignored output path, schema deployment/access and quiet-window consistency. No credentials or row contents were logged.");
  process.exitCode = 1;
});
