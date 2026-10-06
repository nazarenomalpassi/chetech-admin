import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
import { addRepairPaymentAction, reverseRepairPaymentAction, saveRepairAction } from "./actions";

const repairId = "00000000-0000-4000-8000-000000000001";
const paymentId = "00000000-0000-4000-8000-000000000002";
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
describe("repair payment actions", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockResolvedValue({ data: { id: repairId }, error: null }); });
  it("removes only the identified payment with a reason through the atomic correction RPC and returns to its ledger", async () => {
    await expect(reverseRepairPaymentAction(form({ repairId, paymentId, reason: "Pago de prueba" }))).rejects.toThrow(`/reparaciones?status=repair_payment_reversed&edit=${repairId}`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("reverse_repair_payment_atomic", { p_repair_id: repairId, p_payment_id: paymentId, p_reason: "Pago de prueba" });
    expect(mocks.admin).toHaveBeenCalledOnce();
  });
  it("preserves the selected ledger on a missing correction reason without touching money", async () => {
    await expect(reverseRepairPaymentAction(form({ repairId, paymentId, reason: "" }))).rejects.toThrow(`edit=${repairId}`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps a database rejection visible and retains the selected record", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Caja historica sin respaldo suficiente." } });
    await expect(reverseRepairPaymentAction(form({ repairId, paymentId, reason: "Pago de prueba" }))).rejects.toThrow(`edit=${repairId}`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("records split additional payments in the existing record and returns to its ledger", async () => {
    const payments = [{ method: "efectivo", amount: 40 }, { method: "mp", amount: 30 }];
    await expect(addRepairPaymentAction(form({ repairId, requestId: paymentId, paymentDate: "2026-10-06", paymentsJson: JSON.stringify(payments) }))).rejects.toThrow(`/reparaciones?status=repair_payment_added&edit=${repairId}`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("add_repair_payment_atomic", { p_input: expect.objectContaining({ repairId, payments }) });
  });
  it("does not register an empty payment row and keeps the ledger selected", async () => {
    await expect(addRepairPaymentAction(form({ repairId, requestId: paymentId, paymentDate: "2026-10-06", paymentsJson: '[{"method":"efectivo","amount":0}]' }))).rejects.toThrow(`edit=${repairId}`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps the new record selected after saving a quote without collecting any money", async () => {
    await expect(saveRepairAction(form({ requestId: paymentId, customerName: "Cliente", device: "TV", amount: "100", entryDate: "2026-10-06", paymentDate: "2026-10-06", paymentsJson: '[{"method":"efectivo","amount":0}]' }))).rejects.toThrow(`/reparaciones?status=repair_created&edit=${repairId}`);
    expect(mocks.rpc.mock.calls[0][1].p_input.payments).toEqual([]);
  });
  it("does not allow an unauthorized account to correct a payment", async () => {
    mocks.admin.mockRejectedValue(new Error("Acceso denegado"));
    await expect(reverseRepairPaymentAction(form({ repairId, paymentId, reason: "Pago de prueba" }))).rejects.toThrow("Acceso denegado");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
