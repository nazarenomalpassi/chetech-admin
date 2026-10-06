import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), insert: vi.fn(), currentCash: vi.fn(), rows: [] as unknown[], existing: null as unknown }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth, requirePermission: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/cash/queries", () => ({ getCashData: mocks.currentCash }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { closeCashReconciliationCorrectionAction, reopenCashReconciliationAction } from "./reconciliation-actions";
const rootId = "11111111-1111-4111-8111-111111111111";
const reopenId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const accounts = [{ method: "efectivo", expected: 100, physical: 90, difference: -10, reason: "Faltante" }, { method: "nx", expected: 20, physical: 20, difference: 0, reason: "" }, { method: "mp", expected: 30, physical: 30, difference: 0, reason: "" }];
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "actor" }); mocks.rows = []; mocks.existing = null;
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(), range: vi.fn(), insert: mocks.insert };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    query.maybeSingle.mockImplementation(async () => ({ data: table === "operations_cash_reconciliations" ? { id: rootId, accounts } : mocks.existing, error: null }));
    query.range.mockImplementation(async () => ({ data: mocks.rows, error: null })); return query;
  });
});
const request = { id: requestId, rootId, expectedHeadId: rootId, reason: "Conteo anterior errado" };
describe("traceable reopening and correction actions", () => {
  it("copies the historical snapshot when reopening, without reading or updating current balances", async () => {
    expect((await reopenCashReconciliationAction(request)).success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ root_id: rootId, supersedes_id: null, kind: "reopened", accounts, created_by: "actor" }));
    expect(mocks.currentCash).not.toHaveBeenCalled();
    expect(mocks.from.mock.calls.every(([table]) => /^operations_cash_reconcil/.test(table))).toBe(true);
  });
  it("rejects a stale head, missing reason and non-admin requests before writing", async () => {
    expect((await reopenCashReconciliationAction({ ...request, expectedHeadId: reopenId })).success).toBe(false);
    expect((await reopenCashReconciliationAction({ ...request, reason: "" })).success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.auth.mockRejectedValue(new Error("denied"));
    await expect(reopenCashReconciliationAction(request)).rejects.toThrow("denied");
  });
  it("never closes a correction directly over the original closed snapshot", async () => {
    expect((await closeCashReconciliationCorrectionAction({ ...request, accounts })).success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("is idempotent for an already recorded amendment", async () => {
    mocks.existing = { id: requestId, root_id: rootId, kind: "reopened" };
    expect((await reopenCashReconciliationAction(request)).success).toBe(true);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("closes a reopened historical count as a new linked record", async () => {
    mocks.rows = [{ id: reopenId, root_id: rootId, supersedes_id: null, kind: "reopened", accounts }];
    const corrected = accounts.map((account) => account.method === "efectivo" ? { ...account, physical: 95, reason: "Monedas recontadas" } : account);
    expect((await closeCashReconciliationCorrectionAction({ ...request, expectedHeadId: reopenId, accounts: corrected, observations: "Reconteo del dia original" })).success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ supersedes_id: reopenId, kind: "closed", reason: request.reason,
      accounts: expect.arrayContaining([expect.objectContaining({ expected: 100, physical: 95, difference: -5 })]) }));
    expect(mocks.currentCash).not.toHaveBeenCalled();
  });
  it("rejects forged expected historical totals and an unverified concurrent revision", async () => {
    mocks.rows = [{ id: reopenId, root_id: rootId, supersedes_id: null, kind: "reopened", accounts }];
    const tampered = accounts.map((account) => ({ ...account, expected: 999 }));
    expect((await closeCashReconciliationCorrectionAction({ ...request, expectedHeadId: reopenId, accounts: tampered })).success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    expect((await closeCashReconciliationCorrectionAction({ ...request, expectedHeadId: reopenId, accounts })).success).toBe(false);
  });
});
