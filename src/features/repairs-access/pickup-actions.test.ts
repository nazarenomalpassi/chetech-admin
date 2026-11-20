import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
  rows: {} as Record<string, unknown>
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    rpc: mocks.rpc,
    from: () => {
      let id = "";
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          id = value;
          return query;
        },
        maybeSingle: async () => ({ data: mocks.rows[id] ?? null, error: null })
      };
      return query;
    }
  })
}));
import { markPaidOrdersPickedUpAction } from "./pickup-actions";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const order = (id: string, repairNumber: string, overrides = {}) => ({
  id,
  repair_number: repairNumber,
  status: "listo_para_retirar",
  is_paid: true,
  delivered_at: null,
  workflow_version: 3,
  repair_access_customers: [{ full_name: "Cliente" }],
  ...overrides
});

describe("bulk pickup for paid orders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    mocks.rows = {
      [first]: order(first, "REP-000001"),
      [second]: order(second, "REP-000002", { is_paid: false })
    };
  });

  it("delivers each paid order once and reports the ones that could not be marked", async () => {
    const result = await markPaidOrdersPickedUpAction([first, second, first]);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ success: false, done: 1 });
    expect(result.failed).toEqual([
      { repairNumber: "REP-000002", message: "La orden todavía figura con saldo pendiente." }
    ]);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "workshop_deliver",
      expect.objectContaining({ p_order_id: first, p_expected_version: 3, p_allow_balance: false })
    );
    expect(mocks.refresh).toHaveBeenCalledWith("/reparaciones-access");
  });

  it("rejects an empty or invalid selection without touching orders", async () => {
    await expect(markPaidOrdersPickedUpAction([])).resolves.toMatchObject({ success: false });
    await expect(markPaidOrdersPickedUpAction(["no-es-un-id"])).resolves.toMatchObject({
      success: false
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
