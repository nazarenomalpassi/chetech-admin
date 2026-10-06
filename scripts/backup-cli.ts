import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseEnv } from "node:util";
import { checksum, verifyOperationalExport, type OperationalExport } from "../src/app/api/backup/operational-export";

export async function readBackupCredentials(envPath: string) {
  const env = parseEnv(await readFile(envPath, "utf8"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing backup credentials in explicit env file");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid backup service URL"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) throw new Error("Backup credentials require TLS except for localhost");
  if (parsed.username || parsed.password) throw new Error("Backup service URL must not contain credentials");
  return { url, key };
}

export async function writeBackupArtifacts(backup: OperationalExport, outDir: string) {
  verifyOperationalExport(backup);
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  const stem = `operational-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const dataPath = join(outDir, `${stem}.json`);
  const manifestPath = join(outDir, `${stem}.manifest.json`);
  const bytes = Buffer.from(JSON.stringify(backup), "utf8");
  await writeFile(dataPath, bytes, { flag: "wx", mode: 0o600 });
  await writeFile(manifestPath, JSON.stringify({
    format: backup.format, version: backup.version, fullDatabaseBackup: false,
    dataFile: basename(dataPath), byteLength: bytes.length,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    manifestSha256: backup.manifestSha256, manifest: backup.manifest
  }, null, 2), { flag: "wx", mode: 0o600 });
  return { dataPath, manifestPath };
}

export async function readVerifiedBackup(path: string, manifestPath = path.replace(/\.json$/, ".manifest.json")) {
  const bytes = await readFile(path);
  const backup = JSON.parse(bytes.toString("utf8")) as OperationalExport;
  verifyOperationalExport(backup);
  const sidecar = JSON.parse(await readFile(manifestPath, "utf8"));
  if (sidecar.fileSha256 !== createHash("sha256").update(bytes).digest("hex") || sidecar.byteLength !== bytes.length) throw new Error("Artifact byte checksum mismatch");
  if (sidecar.dataFile !== basename(path) || sidecar.fullDatabaseBackup !== false || sidecar.manifestSha256 !== backup.manifestSha256 || checksum(sidecar.manifest) !== backup.manifestSha256) throw new Error("Sidecar manifest mismatch");
  return backup;
}
