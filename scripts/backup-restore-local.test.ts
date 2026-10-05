import { describe, expect, it, vi } from "vitest";
import { checksum } from "../src/app/api/backup/operational-export";
import { assertEmptyDestination, assertLocalContainerBindings, assertLocalRestoreTarget, buildInsertBatch, compareRestoredRows, createNewRestoreDatabase, foreignKeyOrphanSql, restoreApplicationRows, verifyRestoredApplication } from "./backup-restore-local-core";

describe("disposable local application restore safety", () => {
  it("requires localhost, the isolated port and a disposable test database name", () => {
    expect(assertLocalRestoreTarget("postgresql://postgres:test@127.0.0.1:54339/chetech_restore_20261005")).toBe("chetech_restore_20261005");
    for (const url of ["postgresql://postgres:test@db.example.com:54339/chetech_restore_20261005", "postgresql://postgres:test@127.0.0.1:5432/chetech_restore_20261005", "postgresql://postgres:test@127.0.0.1:54339/chetech_staging", "postgresql://postgres:test@127.0.0.1:54339/postgres", "postgresql://postgres:test@127.0.0.1:54339/chetech_restore_20261005?host=remote.example.com", "postgresql://postgres:test@127.0.0.1:54339/chetech_restore_20261005?dbname=chetech_staging"]) {
      expect(() => assertLocalRestoreTarget(url)).toThrow(/local|disposable|54339/i);
    }
  });
  it("keeps historical IDs/values in bound JSON instead of interpolating data into SQL", () => {
    const rows = [{ id: "historic-id", notes: "private ' quote", stock: 7 }];
    const batch = buildInsertBatch("products", rows, ["id", "notes", "stock"]);
    expect(batch.sql).toContain('jsonb_populate_recordset(null::public."products", $1::jsonb)');
    expect(batch.sql).not.toContain("historic-id");
    expect(JSON.parse(batch.params[0])).toEqual(rows);
    expect(() => buildInsertBatch("products;drop", rows, ["id"])).toThrow(/identifier/i);
  });
  it("checks exact identities, counts and content checksum without printing row contents", () => {
    const rows = [{ id: "historic-id", stock: 7 }];
    const entry = { table: "products", identity: "id", rowCount: 1, sha256: checksum(rows) };
    expect(compareRestoredRows(entry, rows, rows)).toMatchObject({ idsVerified: true, rowCount: 1, sha256: entry.sha256 });
    expect(() => compareRestoredRows(entry, rows, [{ id: "changed-id", stock: 7 }])).toThrow("products: identity mismatch");
    expect(() => compareRestoredRows(entry, rows, [{ id: "historic-id", stock: 8 }])).toThrow("products: checksum mismatch");
  });
  it("builds orphan checks for covered foreign keys, including nullable composite keys", () => {
    const sql = foreignKeyOrphanSql({ child_schema: "public", child_table: "sale_items", child_columns: ["sale_id"], parent_schema: "public", parent_table: "sales", parent_columns: ["id"], match_type: "s" });
    expect(sql).toContain('c."sale_id" is not null');
    expect(sql).toContain('not exists (select 1 from "public"."sales" p');
    expect(sql).not.toContain("delete");
  });
  it("rejects a nonempty destination before inserts and rolls back a failed data import", async () => {
    const entry = { table: "products", identity: "id", module: "inventory", rowCount: 1, sha256: checksum([{ id: "1", stock: 7 }]), availability: "exported" as const };
    const backup = { data: { products: [{ id: "1", stock: 7 }] }, manifest: { tables: [entry] } } as never;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("current_database")) return { rows: [{ name: "chetech_restore_20261005" }] };
      if (sql.startsWith("select count")) return { rows: [{ count: "1" }] };
      return { rows: [] };
    });
    await expect(restoreApplicationRows({ query }, backup, "chetech_restore_20261005")).rejects.toThrow(/not empty/i);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql === "rollback")).toBe(true);
  });
  it("never replaces or drops an existing restore database", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ exists: true }] });
    await expect(createNewRestoreDatabase({ query }, "chetech_restore_20261005")).rejects.toThrow(/already exists/i);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toMatch(/drop|delete|truncate/i);
  });
  it("casts PostgreSQL name arrays to text arrays for reliable node-pg metadata decoding", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await verifyRestoredApplication({ query }, { data: {}, manifest: { tables: [] } } as never);
    expect(query.mock.calls[0][0]).toContain("a.attname::text");
  });
  it("requires every public/private/auth destination table to be empty, including optional modules", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ schema_name: "public", table_name: "workshop_events" }] }).mockResolvedValueOnce({ rows: [{ count: "1" }] });
    await expect(assertEmptyDestination({ query })).rejects.toThrow(/destination is not empty/i);
    expect(query.mock.calls.every(([sql]) => !/drop|delete|truncate|insert/i.test(sql))).toBe(true);
  });
  it("rolls back a failed insertion and hides the database's private row error detail", async () => {
    const rows = [{ id: "1", stock: 7 }];
    const backup = { data: { products: rows }, manifest: { tables: [{ table: "products", identity: "id", module: "inventory", rowCount: 1, sha256: checksum(rows), availability: "exported" }] } } as never;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("current_database")) return { rows: [{ name: "chetech_restore_20261005" }] };
      if (sql.startsWith("select count")) return { rows: [{ count: "0" }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ column_name: "id", is_generated: "NEVER" }, { column_name: "stock", is_generated: "NEVER" }] };
      if (sql.startsWith("insert")) throw new Error("pii-secret-must-not-appear");
      return { rows: [] };
    });
    await expect(restoreApplicationRows({ query }, backup, "chetech_restore_20261005")).rejects.toThrow("products: insert failed; no private row details logged");
    expect(query.mock.calls.some(([sql]) => sql === "set local session_replication_role = replica")).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql === "rollback")).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql === "commit")).toBe(false);
  });
  it("rejects extra public Docker PostgreSQL bindings before storing private historical data", () => {
    expect(() => assertLocalContainerBindings([{ HostIp: "127.0.0.1", HostPort: "54339" }])).not.toThrow();
    expect(() => assertLocalContainerBindings([{ HostIp: "127.0.0.1", HostPort: "54339" }, { HostIp: "0.0.0.0", HostPort: "54340" }])).toThrow(/Container/);
    expect(() => assertLocalContainerBindings([])).toThrow(/Container/);
  });
});
