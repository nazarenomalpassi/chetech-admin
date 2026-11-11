import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), from: vi.fn(), eq: vi.fn(), limit: vi.fn(), single: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.permission, requireUser: async () => ({ id: "authenticated-owner" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { GET } from "./route";

describe("REP manual lookup shares the bounded collection target", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.permission.mockResolvedValue({ role: "admin" });
    mocks.single.mockResolvedValue({ error: null, data: { id: "native-id", repair_number: "REP-000123", workflow_version: 9, intake_date: "2026-09-01", final_amount: 0, approved_amount: 80000, budget_amount: 70000, repair_access_customers: { full_name: "Cliente" }, repair_access_devices: { device_type: "TV" } } });
    mocks.limit.mockResolvedValue({ error: null, data: [{ id: "financial-id", repair_access_order_id: "native-id", final_price: 80000, customer_name: "Cliente", device: "TV", financial_version: 4, repair_payments: [] }] });
    mocks.from.mockImplementation((table: string) => {
      const query: any = { select: (columns: string) => { mocks.select(table, columns); return query; }, eq: (column: string, value: unknown) => { mocks.eq(table, column, value); return query; }, maybeSingle: mocks.single, limit: mocks.limit };
      return query;
    });
  });
  const request = (repairNumber: string) => GET(new Request("https://example.test/api/repair-access/orders/123"), { params: Promise.resolve({ repairNumber }) });
  it("returns an existing financial record by native ID instead of a second creation path", async () => {
    const response = await request("123");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ order: { id: "native-id", amount: 80000 }, financialRecord: { id: "financial-id", financialVersion: 4 } });
    expect(mocks.eq.mock.calls).toEqual([["repair_access_orders", "repair_number", "REP-000123"], ["repairs", "repair_access_order_id", "native-id"]]);
    expect(mocks.limit).toHaveBeenCalledWith(2);
  });
  it("returns the authenticated draft owner and fresh delivery version without caching", async () => {
    const response = await request("123");
    expect(await response.json()).toMatchObject({ draftOwnerId: "authenticated-owner", order: { id: "native-id", workflowVersion: 9 } });
    expect(mocks.select.mock.calls[0][1]).toContain("workflow_version");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("does not expose draft ownership or read orders without admin authorization", async () => {
    mocks.permission.mockRejectedValue(new Error("denied"));
    const response = await request("123");
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("draftOwnerId");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reports native canonical payments even before a financial record exists", async () => {
    mocks.limit.mockResolvedValue({ error: null, data: [] });
    const original = (await mocks.single()).data;
    mocks.single.mockResolvedValue({ error: null, data: { ...original, repair_access_payments: [
      { method: "nx", amount: 20000, voided_at: null }, { method: "mp", amount: 5000, voided_at: "2026-11-10" }
    ] } });
    const response = await request("123");
    expect(await response.json()).toMatchObject({ financialRecord: null, order: { amount: 80000, paidTotal: 20000, balance: 60000 } });
  });
  it("rejects invalid numbers and ambiguous records without returning a new-record form", async () => {
    expect((await request("%badquery")).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValue({ error: null, data: [{ id: "one" }, { id: "two" }] });
    const response = await request("123");
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("order");
  });
});
