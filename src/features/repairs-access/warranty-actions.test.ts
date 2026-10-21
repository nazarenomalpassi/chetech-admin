import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission, requireAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { startWarrantyReturn, saveWarrantyReturn, correctRepairWarranty } from "./warranty-actions";
const id = "10000000-0000-4000-8000-000000000001";
function form(fields: Record<string, string> = {}) {
  const f = new FormData();
  Object.entries({ id, version: "3", operationId: "10000000-0000-4000-8000-000000000002", ...fields }).forEach(([k, v]) => f.set(k, v));
  return f;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.permission.mockResolvedValue({ role: "tecnico" });
  mocks.rpc.mockResolvedValue({ data: { id, version: 4, replayed: false }, error: null });
});
describe("reingresos por garantia", () => {
  it("corrige garantia con version y motivo sin enviar entrega ni pagos", async () => {
    const f = form({ expectedVersion: "3", hasWarranty: "on", warrantyDays: "90", warrantyConditions: "Fuente", reason: "Garantia omitida al entregar", confirmCorrection: "on", pickedUpAt: "2026-10-21", isPaid: "on" });
    expect((await correctRepairWarranty(null, f)).success).toBe(true);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_warranty_correct", {
      p_order_id: id, p_expected_version: 3, p_operation_id: f.get("operationId"),
      p_has_warranty: true, p_warranty_days: 90, p_conditions: "Fuente", p_reason: "Garantia omitida al entregar", p_confirm: true
    });
  });
  it("no corrige garantia sin confirmacion, motivo o dias validos", async () => {
    const cases: Record<string, string>[] = [{ reason: "", confirmCorrection: "on", warrantyDays: "90" }, { reason: "Omitida", warrantyDays: "90" }, { reason: "Omitida", confirmCorrection: "on", warrantyDays: "0" }];
    for (const fields of cases) {
      expect((await correctRepairWarranty(null, form({ expectedVersion: "3", hasWarranty: "on", ...fields }))).success).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("registra en la misma orden sin enviar campos financieros", async () => {
    const f = form({ receivedOn: "2026-10-19", issueReported: "Volvio a apagarse", accessories: "Control", acknowledgeCoverage: "on", budgetAmount: "999" });
    expect((await startWarrantyReturn(null, f)).success).toBe(true);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_warranty_start", {
      p_order_id: id, p_expected_version: 3, p_operation_id: f.get("operationId"),
      p_received_on: "2026-10-19", p_issue: "Volvio a apagarse", p_accessories: "Control", p_condition_notes: "", p_acknowledge_coverage: true
    });
  });
  it("rechaza fechas imposibles y motivo vacio antes de enviar", async () => {
    for (const fields of [{ receivedOn: "2026-02-30", issueReported: "Volvio a apagarse" }, { receivedOn: "2026-10-19", issueReported: "  " }]) {
      expect((await startWarrantyReturn(null, form(fields))).success).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("permite revision sin fallas y sin presupuesto por un tecnico", async () => {
    expect((await saveWarrantyReturn(null, form({ status: "no_presenta_fallas", progress: "Probado", resolution: "No se reprodujo la falla" }))).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_status).toBe("no_presenta_fallas");
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("budget_amount");
  });
  it("exige administrador, persona y confirmacion para devolver", async () => {
    const f = form({ status: "retirado", recipient: "Cliente", confirmDelivery: "on" });
    expect((await saveWarrantyReturn(null, f)).success).toBe(false);
    mocks.permission.mockResolvedValue({ role: "admin" }); f.delete("confirmDelivery");
    expect((await saveWarrantyReturn(null, f)).success).toBe(false);
    f.set("confirmDelivery", "on");
    expect((await saveWarrantyReturn(null, f)).success).toBe(true);
  });
  it("mantiene el error de concurrencia y no invalida un guardado fallido", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "40001", message: "stale" } });
    expect(await saveWarrantyReturn(null, form({ status: "en_revision" }))).toMatchObject({ success: false, message: expect.stringContaining("otro dispositivo") });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("no informa exito sin recibo verificable del guardado", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await saveWarrantyReturn(null, form({ status: "en_revision" }))).success).toBe(false);
  });
});
