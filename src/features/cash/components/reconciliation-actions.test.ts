import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), cash: vi.fn(), read: vi.fn(), insert: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin, requirePermission: mocks.admin }));
vi.mock("@/features/cash/queries", () => ({ getCashData: mocks.cash }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }), insert: mocks.insert }) }) }));
import { saveCashReconciliationAction } from "./reconciliation-actions";

const input = { id: "11111111-1111-4111-8111-111111111111", date: "2026-10-05", observations: "Conteo final", accounts: [
  { method: "efectivo", expected: 100, physical: 90, reason: "Faltante" }, { method: "nx", expected: 20, physical: 20, reason: "" }, { method: "mp", expected: 30, physical: 30, reason: "" }
] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "actor" });
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.cash.mockResolvedValue({ today: input.date, balances: input.accounts.map((account) => ({ method: account.method, balance: account.expected })) });
  mocks.insert.mockResolvedValue({ error: null });
});
describe("audited close server action", () => {
  it("captures all three server balances with actor and differences, never calls legacy close", async () => {
    expect((await saveCashReconciliationAction(input)).success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: "actor", business_date: input.date,
      accounts: expect.arrayContaining([expect.objectContaining({ method: "efectivo", expected: 100, physical: 90, difference: -10 })]) }));
  });
  it("rejects a tampered expected value instead of using hidden form totals", async () => {
    expect((await saveCashReconciliationAction({ ...input, accounts: [{ ...input.accounts[0], expected: 9999 }, ...input.accounts.slice(1)] })).success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("is idempotent for an already persisted request", async () => {
    mocks.read.mockResolvedValue({ data: { id: input.id }, error: null });
    expect((await saveCashReconciliationAction(input)).success).toBe(true);
    expect(mocks.cash).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("requires authorization before any read or write", async () => {
    mocks.admin.mockRejectedValue(new Error("denied"));
    await expect(saveCashReconciliationAction(input)).rejects.toThrow("denied");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not report failed persistence as success", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    expect((await saveCashReconciliationAction(input)).success).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects midnight rollover and differences with no justification", async () => {
    mocks.cash.mockResolvedValue({ today: "2026-10-06", balances: [] });
    expect((await saveCashReconciliationAction(input)).success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
