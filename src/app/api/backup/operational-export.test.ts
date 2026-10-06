import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OPERATIONAL_TABLES, checksum, createOperationalExport, verifyOperationalExport } from "./operational-export";

function client(rows: Record<string, Record<string, unknown>[]>, cap = 2) {
  const calls: { table: string; from: number; to: number; order: string }[] = [];
  return {
    calls,
    from(table: string) {
      let head = false;
      let order = "";
      return {
        select(_columns: string, options: { head?: boolean }) { head = Boolean(options.head); return this; },
        order(key: string) { order = key; return this; },
        range(from: number, to: number) {
          calls.push({ table, from, to, order });
          return Promise.resolve({ data: (rows[table] ?? []).slice(from, Math.min(to + 1, from + cap)), count: (rows[table] ?? []).length, error: null });
        },
        then(done: (value: unknown) => unknown) {
          return Promise.resolve({ data: head ? null : rows[table] ?? [], count: (rows[table] ?? []).length, error: null }).then(done);
        }
      };
    }
  };
}

describe("operational JSON export", () => {
  it("covers every public table declared by the checked-in schema and migrations", () => {
    const sql = ["supabase/schema.sql", ...readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).map(name => `supabase/migrations/${name}`)]
      .map(file => readFileSync(resolve(file), "utf8")).join("\n");
    const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map(match => match[1]);
    expect([...new Set(tables)].filter(table => !OPERATIONAL_TABLES.some(entry => entry.table === table))).toEqual([]);
  });

  it("continues after short capped pages and preserves IDs and all columns", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: String(index), foreign_id: "REP-1", private_notes: "kept" }));
    const db = client({ products: rows });
    const backup = await createOperationalExport(db, { pageSize: 500, sourceRevision: "test-revision" });
    expect(backup.data.products).toEqual(rows);
    expect(db.calls.filter(call => call.table === "products").map(call => call.from)).toEqual([0, 2, 4]);
    expect(db.calls.find(call => call.table === "app_settings")?.order).toBe("key");
    expect(backup.manifest.tables.find(table => table.table === "products")).toMatchObject({ rowCount: 5, module: "inventory", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(backup.manifest).toMatchObject({ fullDatabaseBackup: false, sourceRevision: "test-revision", consistency: "non-transactional" });
    expect(verifyOperationalExport(JSON.parse(JSON.stringify(backup)))).toEqual({ tableCount: OPERATIONAL_TABLES.length, rowCount: 5 });
  });

  it("detects row tampering and manifest tampering", async () => {
    const backup = await createOperationalExport(client({ products: [{ id: "1", stock: 8 }] }));
    backup.data.products[0].stock = 9;
    expect(() => verifyOperationalExport(backup)).toThrow(/checksum/i);
    const other = await createOperationalExport(client({}));
    other.manifest.tables[0].module = "wrong";
    expect(() => verifyOperationalExport(other)).toThrow(/manifest|provenance/i);
  });

  it("fails closed on missing tables rather than emitting a partial successful backup", async () => {
    const db = client({});
    db.from = () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, count: null, error: { message: "missing relation" } }) }) }) }) as never;
    await expect(createOperationalExport(db)).rejects.toThrow(/missing relation/);
  });

  it("rejects duplicate identities and truncated results", async () => {
    await expect(createOperationalExport(client({ products: [{ id: "1" }, { id: "1" }] }))).rejects.toThrow(/duplicate/i);
    await expect(createOperationalExport(client({ products: [{ id: "1" }] }, 0))).rejects.toThrow(/incomplete|truncated/i);
  });
  it("records not-deployed release tables explicitly but never skips denied tables", async () => {
    const db = client({});
    const original = db.from.bind(db);
    db.from = table => table === "operations_cash_reconciliations"
      ? { select: () => ({ order: () => ({ range: async () => ({ data: null, count: null, error: { code: "PGRST205", message: "Could not find the table in the schema cache" } }) }) }) } as never
      : original(table);
    const backup = await createOperationalExport(db);
    expect(backup.manifest.tables.find(table => table.table === "operations_cash_reconciliations")?.availability).toBe("not-deployed");
    expect(verifyOperationalExport(backup).rowCount).toBe(0);
    db.from = table => table === "operations_cash_reconciliations"
      ? { select: () => ({ order: () => ({ range: async () => ({ data: null, count: null, error: { code: "42501", message: "permission denied" } }) }) }) } as never
      : original(table);
    await expect(createOperationalExport(db)).rejects.toThrow(/permission denied/);
  });
  it("keeps older artifacts verifiable after optional release tables are added", async () => {
    const backup = await createOperationalExport(client({}));
    for (const table of OPERATIONAL_TABLES.filter(table => table.optional)) delete backup.data[table.table];
    backup.manifest.tables = backup.manifest.tables.filter(table => !table.optional);
    backup.manifestSha256 = checksum(backup.manifest);
    expect(verifyOperationalExport(backup)).toEqual({ tableCount: 40, rowCount: 0 });
  });
  it("exports fiscal counters using their complete composite primary key", async () => {
    const rows = [
      { environment: "homologation", issuer_cuit: "synthetic", point_of_sale: 2, voucher_type: 11, last_authorized_number: 4 },
      { environment: "homologation", issuer_cuit: "synthetic", point_of_sale: 3, voucher_type: 11, last_authorized_number: 8 }
    ];
    const backup = await createOperationalExport(client({ fiscal_issuance_counters: rows }));
    expect(backup.data.fiscal_issuance_counters).toEqual(rows);
    expect(verifyOperationalExport(backup).rowCount).toBe(2);
  });
});
