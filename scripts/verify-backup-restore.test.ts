import { describe, expect, it } from "vitest";
import { assertIsolatedTarget, checkRestoredTable } from "./verify-backup-restore-core";
import { checksum } from "../src/app/api/backup/operational-export";
describe("read-only staging restoration verification", () => {
  it("rejects remote and non-staging connections", () => {
    expect(() => assertIsolatedTarget("postgresql://user:secret@production.example.com:54339/postgres")).toThrow(/isolated/i);
    expect(() => assertIsolatedTarget("postgresql://user:secret@127.0.0.1:5432/postgres")).toThrow(/54339/);
    expect(() => assertIsolatedTarget("postgresql://user:secret@127.0.0.1:54339/postgres")).not.toThrow();
  });
  it("detects data changes even when restored row counts match", () => {
    const rows = [{ id: "1", stock: 4 }];
    expect(() => checkRestoredTable({ table: "products", rowCount: 1, sha256: checksum(rows) }, [{ id: "1", stock: 5 }])).toThrow(/checksum/i);
    expect(() => checkRestoredTable({ table: "products", rowCount: 1, sha256: checksum(rows) }, [])).toThrow(/count/i);
    expect(() => checkRestoredTable({ table: "products", rowCount: 1, sha256: checksum(rows) }, rows)).not.toThrow();
  });
});
