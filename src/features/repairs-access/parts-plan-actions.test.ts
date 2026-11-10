import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission, requireAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { manageRepairPart, saveWorkshopLocation } from "./coordination-actions";
import { saveSupplierClaim } from "./supplier-claim-actions";
import { startWarrantyObservation } from "./operational-metrics-actions";

const id = "10000000-0000-4000-8000-000000000001";
function form(input: Record<string, string>) {
  const data = new FormData();
  Object.entries({ id, version: "2", operationId: id, ...input }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.permission.mockResolvedValue({ role: "admin" });
  mocks.admin.mockResolvedValue({ role: "admin" }); mocks.rpc.mockResolvedValue({ data: {}, error: null });
});
describe("coordinacion sencilla sin efectos financieros", () => {
  it("no inicia un seguimiento de garantias sin confirmacion explicita", async () => {
    expect((await startWarrantyObservation(null, new FormData())).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const data = form({ confirmObservation: "on" });
    expect((await startWarrantyObservation(null, data)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("start_workshop_warranty_observation");
  });
  it.each([["", null], ["0", 0], ["24000.50", 24000.5]])("costo %s conserva desconocido distinto de cero", async (input, expected) => {
    await manageRepairPart(null, form({ action: "order", supplier: "Proveedor", expectedDate: "", unitCost: String(input) }));
    expect(mocks.rpc.mock.calls[0][1].p_unit_cost).toBe(expected);
  });
  it("actualiza ubicacion y revision sin borrar el tecnico ni modificar presupuesto", async () => {
    expect(await saveWorkshopLocation(null, form({ location: "Estante A2", nextActionDate: "2026-11-12" }))).toMatchObject({ success: true });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save", {
      p_order_id: id, p_expected_version: 2, p_payload: { physical_location: "Estante A2", next_action_date: "2026-11-12" }
    });
  });
  it("rechaza fechas inexistentes antes de guardar", async () => {
    expect((await saveWorkshopLocation(null, form({ location: "A", nextActionDate: "2026-02-31" }))).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
describe("reclamos al proveedor", () => {
  it("abre un reclamo trazable sin registrar egresos o devoluciones", async () => {
    const result = await saveSupplierClaim(null, form({ partId: id, reason: "Repuesto recibido con falla", quantity: "1", warrantyReturnId: "", extraCost: "" }));
    expect(result.success).toBe(true);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_supplier_claim", {
      p_operation_id: id, p_part_id: id, p_expected_version: 2, p_claim_id: null,
      p_payload: { reason: "Repuesto recibido con falla", quantity: 1, warranty_return_id: null, extra_cost: null }
    });
  });
  it("requiere resolucion al cerrar y preserva los campos para reintentar", async () => {
    const data = form({ claimId: id, partId: id, claimStatus: "resolved", resolution: "", extraCost: "0" });
    expect((await saveSupplierClaim(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    data.set("resolution", "Proveedor reemplazo la fuente");
    expect((await saveSupplierClaim(null, data)).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_payload).toEqual({ status: "resolved", resolution: "Proveedor reemplazo la fuente", extra_cost: 0 });
  });
  it("no acepta cantidades negativas ni costos inventados", async () => {
    expect((await saveSupplierClaim(null, form({ partId: id, reason: "Falla", quantity: "-1" }))).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("no borra un costo existente si el formulario de actualizacion no lo incluye", async () => {
    await saveSupplierClaim(null, form({ claimId: id, partId: id, claimStatus: "sent", resolution: "Despachado" }));
    expect(mocks.rpc.mock.calls[0][1].p_payload).toEqual({ status: "sent", resolution: "Despachado" });
  });
  it("explica conflictos de otro dispositivo sin decir que se guardo", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "40001", message: "stale" } });
    expect(await saveSupplierClaim(null, form({ partId: id, reason: "Repuesto fallado", quantity: "1" }))).toMatchObject({ success: false, message: expect.stringMatching(/otro dispositivo/) });
  });
});
