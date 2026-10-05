import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";
const mock = vi.hoisted(() => ({ from: vi.fn(), history: vi.fn(), native: vi.fn(), linked: vi.fn(), eq: vi.fn(), limit: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mock.from, rpc: mock.rpc }) }));
import { getRepairs } from "./queries";

const native = { id: "00000000-0000-4000-8000-000000000123", repair_number: "REP-000123", intake_date: "2026-09-01", final_amount: 0, approved_amount: 80000, budget_amount: 70000, issue_reported: "No enciende", repair_access_customers: { full_name: "Cliente", phone: "123" }, repair_access_devices: { device_type: "TV" } };
const row = (id: string) => ({ id, customer_name: "Cliente", device: "TV", final_price: 80000, entry_date: "2026-09-01", created_at: "2026-09-01", financial_version: 4, repair_payments: [{ id: "payment", method: "nx", amount: 30000, payment_date: "2026-10-05" }] });

describe("bounded REP collection navigation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.history.mockResolvedValue({ data: [row("history-record")], count: 151, error: null });
    mock.native.mockResolvedValue({ data: native, error: null });
    mock.linked.mockResolvedValue({ data: [{ ...row("outside-page"), repair_access_order_id: native.id, repair_access_orders: { repair_number: native.repair_number } }], error: null });
    mock.from.mockImplementation((table: string) => {
      const query: any = { select: () => query, order: () => query, range: mock.history, maybeSingle: mock.native };
      query.eq = (column: string, value: unknown) => { mock.eq(table, column, value); return query; };
      query.limit = (count: number) => { mock.limit(table, count); return mock.linked(); };
      return query;
    });
  });

  it("selects the existing financial record by native ID even outside the requested history page", async () => {
    const data = await getRepairs(3, "rep 123");
    expect(data.items.map((repair) => repair.id)).toEqual(["history-record"]);
    expect(data.pagination).toEqual(createPaginationMeta(151, 3, DEFAULT_PAGE_SIZE));
    const range = getPaginationRange(3);
    expect(mock.history).toHaveBeenCalledExactlyOnceWith(range.from, range.to);
    expect(mock.eq).toHaveBeenCalledWith("repair_access_orders", "repair_number", "REP-000123");
    expect(mock.eq).toHaveBeenCalledWith("repairs", "repair_access_order_id", native.id);
    expect(mock.limit).toHaveBeenCalledWith("repairs", 2);
    expect(data.collectionTarget?.repair).toMatchObject({ id: "outside-page", repairAccessOrderId: native.id, paidTotal: 30000, balance: 50000, financialVersion: 4 });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("prepares only the current native price when no linked financial record exists", async () => {
    mock.linked.mockResolvedValue({ data: [], error: null });
    const data = await getRepairs(1, "123");
    expect(data.collectionTarget?.repair).toBeNull();
    expect(data.collectionTarget?.order).toMatchObject({ id: native.id, repairNumber: "REP-000123", amount: 80000, intakeDate: "2026-09-01" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on ambiguous linkage and does not perform a broad search for invalid links", async () => {
    mock.linked.mockResolvedValue({ data: [row("one"), row("two")], error: null });
    const ambiguous = await getRepairs(1, "REP-123");
    expect(ambiguous.collectionTarget?.error).toMatch(/varios|mas de un/i);
    expect(ambiguous.collectionTarget?.order).toBeNull();
    mock.eq.mockClear();
    const invalid = await getRepairs(1, "%bad*query");
    expect(invalid.collectionTarget?.error).toMatch(/numero|enlace/i);
    expect(mock.eq).not.toHaveBeenCalled();
  });
});
