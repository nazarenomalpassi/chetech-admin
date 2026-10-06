import { checksum, type ExportRow } from "../src/app/api/backup/operational-export";

export function assertIsolatedTarget(connectionString: string) {
  let target: URL;
  try { target = new URL(connectionString); } catch { throw new Error("Invalid isolated staging connection URL"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !["127.0.0.1", "localhost"].includes(target.hostname)) throw new Error("Restore verification requires isolated localhost staging");
  if (target.port !== "54339") throw new Error("Restore verification requires the agreed isolated port 54339");
  if (target.search || target.hash) throw new Error("Isolated local URLs must not contain routing query options or fragments");
}

export function checkRestoredTable(entry: { table: string; rowCount: number; sha256: string }, rows: ExportRow[]) {
  if (rows.length !== entry.rowCount) throw new Error(`${entry.table}: restored row count mismatch`);
  if (checksum(rows) !== entry.sha256) throw new Error(`${entry.table}: restored checksum mismatch`);
}
