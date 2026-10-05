import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { verifyOperationalExport } from "../src/app/api/backup/operational-export";
import { readVerifiedBackup } from "./backup-cli";

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, manifest: { type: "string" } } });
  if (!values.file) throw new Error("--file is required");
  const path = resolve(values.file);
  const result = verifyOperationalExport(await readVerifiedBackup(path, values.manifest ? resolve(values.manifest) : undefined));
  console.log(JSON.stringify({ ...result, verified: true, fullDatabaseBackup: false }));
}
main().catch(() => { console.error("Backup verification failed: invalid or missing artifact/manifest. No row contents were logged."); process.exitCode = 1; });
