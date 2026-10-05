import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBackupCredentials, readVerifiedBackup, writeBackupArtifacts } from "./backup-cli";
import { createOperationalExport } from "../src/app/api/backup/operational-export";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function directory() { const dir = await mkdtemp(join(tmpdir(), "chetech-backup-test-")); dirs.push(dir); return dir; }
describe("private backup CLI", () => {
  it("reads only the explicitly supplied env file without altering it or process environment", async () => {
    const path = join(await directory(), "input.env");
    const content = 'NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY="test-secret"\nUNRELATED="do-not-load"\n';
    await writeFile(path, content);
    const old = process.env.UNRELATED;
    expect(await readBackupCredentials(path)).toEqual({ url: "https://example.supabase.co", key: "test-secret" });
    expect(await readFile(path, "utf8")).toBe(content);
    expect(process.env.UNRELATED).toBe(old);
  });
  it("never echoes sensitive env contents when credentials are invalid", async () => {
    const path = join(await directory(), "input.env");
    await writeFile(path, "SUPABASE_SERVICE_ROLE_KEY=secret-must-not-appear");
    await expect(readBackupCredentials(path)).rejects.toThrow("Missing backup credentials in explicit env file");
  });
  it("writes a verified application artifact plus byte-checksummed sidecar with no credentials", async () => {
    const db = { from: () => ({
      select(_columns: string, options: { head?: boolean }) { return options.head ? Promise.resolve({ count: 0, error: null }) : this; },
      order() { return this; },
      range: async () => ({ data: [], count: 0, error: null })
    }) };
    const backup = await createOperationalExport(db);
    const out = await writeBackupArtifacts(backup, await directory());
    const sidecar = JSON.parse(await readFile(out.manifestPath, "utf8"));
    expect(sidecar).toMatchObject({ fullDatabaseBackup: false, byteLength: expect.any(Number), fileSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.parse(await readFile(out.dataPath, "utf8")).format).toBe("chetech-operational-export");
    expect(JSON.stringify(sidecar)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect((await readVerifiedBackup(out.dataPath)).manifest.totalRows).toBe(0);
    await writeFile(out.dataPath, `${await readFile(out.dataPath, "utf8")} `);
    await expect(readVerifiedBackup(out.dataPath)).rejects.toThrow(/byte checksum/i);
  });
});
