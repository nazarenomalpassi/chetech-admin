import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ id: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mock.rpc, from: mock.from }) }));
import { markInstallmentPaidAction, updateInstallmentAction, cancelInstallmentAction } from "./actions";

describe("installment collection action", () => {
  beforeEach(() => vi.clearAllMocks());
  it("delegates payment/cash/parent status/audit to one atomic RPC", async () => {
    mock.rpc.mockResolvedValue({ data: { id: "cuota" }, error: null });
    const form = new FormData();
    form.set("id", "00000000-0000-4000-8000-000000000001"); form.set("paymentMethod", "nx"); form.set("paidDate", "2026-10-05");
    await markInstallmentPaidAction(form).catch(() => undefined);
    expect(mock.rpc).toHaveBeenCalledWith("pay_installment_atomic", { p_installment_id: form.get("id"), p_payment_method: "nx", p_paid_date: "2026-10-05" });
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("passes the user's expected financial version for unpaid edits and cancellations", async () => {
    mock.rpc.mockResolvedValue({ error: null });
    const form = new FormData();
    form.set("id", "00000000-0000-4000-8000-000000000001"); form.set("expectedVersion", "7");
    form.set("dueDate", "2026-10-05"); form.set("paymentMethod", "nx"); form.set("amount", "100");
    await updateInstallmentAction(form).catch(() => undefined);
    expect(mock.rpc).toHaveBeenCalledWith("mutate_installment_atomic", { p_input: expect.objectContaining({ action: "update", expectedVersion: 7 }) });
    await cancelInstallmentAction(form).catch(() => undefined);
    expect(mock.rpc).toHaveBeenLastCalledWith("mutate_installment_atomic", { p_input: expect.objectContaining({ action: "cancel", expectedVersion: 7 }) });
    mock.rpc.mockClear(); form.delete("expectedVersion");
    await updateInstallmentAction(form).catch(() => undefined);
    await cancelInstallmentAction(form).catch(() => undefined);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
