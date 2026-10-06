import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc }) }));
import { getSalaryPlanningData } from "./queries";
beforeEach(() => rpc.mockReset());
it("integrates obligations while preserving balances and member targets", async () => {
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "get_salary_planning_snapshot"
    ? { total_available: 1000, accounts: [{ method: "nx", balance: 1000 }], reserves: [{ amount: 100 }], merchandise: { current_replacement_cost: 200 }, members: [{ id: "one", target_amount: 200, paid_amount: 50 }] }
    : name === "get_purchase_commitments_snapshot" ? { knownOutstanding: 140, unknownCostCount: 1, purchaseCount: 2 } : {} }));
  const data = await getSalaryPlanningData("2026-10");
  expect(data.suggestedSalaryAmount).toBe(560);
  expect(data.totalAvailable).toBe(1000);
  expect(data.accounts[0].balance).toBe(1000);
  expect(data.members[0]).toMatchObject({ targetAmount: 200, paidAmount: 50 });
  expect(data.purchaseCommitments).toMatchObject({ ready: true, unknownCostCount: 1 });
});
it("reports unavailable purchase data explicitly, not a false zero", async () => {
  rpc.mockImplementation(async (name: string) => name === "get_purchase_commitments_snapshot"
    ? { data: null, error: { code: "42883", message: "function missing" } }
    : { error: null, data: { total_available: 1000 } });
  const data = await getSalaryPlanningData("2026-10");
  expect(data.purchaseCommitments).toMatchObject({ ready: false, knownOutstanding: null });
  expect(data.suggestedSalaryAmount).toBe(1000);
});
it("does not accept malformed commitment totals as zero", async () => {
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "get_purchase_commitments_snapshot" ? { knownOutstanding: null } : { total_available: 1000 } }));
  expect((await getSalaryPlanningData("2026-10")).purchaseCommitments.ready).toBe(false);
});
