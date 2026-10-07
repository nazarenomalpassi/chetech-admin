import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission, requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveWorkshopForm, saveQuickWorkshopForm, claimRepairOrder } from "./coordination-actions";
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "tech", role: "tecnico" }); mocks.rpc.mockResolvedValue({ data: {}, error: null }); });
function form() { const data = new FormData(); data.set("id", "10000000-0000-4000-8000-000000000001"); data.set("status", "en_revision"); data.set("expectedVersion", "3"); return data; }
describe("guardado breve del taller", () => {
  it("registra retirado por el cliente usando entrega, sin modificar presupuesto ni cobros", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", "retirado"); data.set("recipient", "Cliente de prueba");
    data.set("deliveryNotes", "Control y cable devueltos"); data.set("confirmDelivery", "on");
    data.set("repairAmount", "999"); data.set("confirmCustomer", "on");
    expect(await saveQuickWorkshopForm(null, data)).toMatchObject({ success: true, orderClosed: true });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_deliver", {
      p_order_id: data.get("id"), p_expected_version: 3, p_recipient: "Cliente de prueba",
      p_notes: "Control y cable devueltos", p_allow_balance: false
    });
  });
  it("bloquea el retiro rapido si falta confirmar o identificar a quien retira", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", "retirado"); data.set("recipient", "Cliente de prueba");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    data.set("confirmDelivery", "on"); data.set("recipient", " ");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("no permite registrar el retiro rapido con rol tecnico", async () => {
    const data = form(); data.set("status", "retirado"); data.set("recipient", "Cliente"); data.set("confirmDelivery", "on");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("mantiene la autorizacion explicita de saldo y exige un motivo", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", "retirado"); data.set("recipient", "Cliente"); data.set("confirmDelivery", "on"); data.set("allowBalance", "on");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    data.set("deliveryNotes", "Retira y abona el viernes");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_allow_balance).toBe(true);
  });
  it("conserva los bloqueos y conflictos del registro real de entrega", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", "retirado"); data.set("recipient", "Cliente"); data.set("confirmDelivery", "on");
    mocks.rpc.mockResolvedValue({ error: { code: "23514", message: "La orden todavia no esta lista para entregar." } });
    expect(await saveQuickWorkshopForm(null, data)).toMatchObject({ success: false, message: expect.stringContaining("no esta lista") });
    mocks.rpc.mockResolvedValue({ error: { code: "40001", message: "stale" } });
    expect(await saveQuickWorkshopForm(null, data)).toMatchObject({ success: false, message: expect.stringContaining("otro dispositivo") });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(["presupuestado_aceptado", "presupuestado_rechazado"])("registra %s en el mismo guardado atomico", async (status) => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.rpc.mockResolvedValue({ data: { id: "10000000-0000-4000-8000-000000000001", version: 6, status, replayed: false }, error: null });
    const data = form(); data.set("status", status); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", "100"); data.set("decisionChannel", "telefono"); data.set("decisionNotes", "Respuesta del cliente");
    const result = await saveQuickWorkshopForm(null, data);
    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_quick", expect.objectContaining({
      p_confirm_customer: true, p_channel: "telefono", p_decision_notes: "Respuesta del cliente",
      p_payload: expect.objectContaining({ status, budget_amount: 100 })
    }));
    expect(result.message).toContain(status.endsWith("aceptado") ? "aceptado" : "rechazado");
  });
  it("no registra rechazo de un presupuesto vacio como si fuera sin cargo", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", "presupuestado_rechazado"); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", ""); data.set("decisionChannel", "presencial");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("indica el control del editor simple cuando falta la confirmacion", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.rpc.mockResolvedValue({ error: { code: "23514", message: "Registra una autorizacion vigente del cliente antes de marcar listo para retirar." } });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    const result = await saveQuickWorkshopForm(null, data);
    expect(result.message).toContain('El cliente confirmo este presupuesto');
    expect(result.success).toBe(false);
  });
  it("no convierte un presupuesto vacio en una autorizacion gratis", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", ""); data.set("confirmCustomer", "on"); data.set("decisionChannel", "presencial");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("el presupuesto vacio no modifica el precio en una actualizacion ordinaria", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "10000000-0000-4000-8000-000000000001", version: 4, status: "en_revision", replayed: false }, error: null });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002"); data.set("repairAmount", "");
    await saveQuickWorkshopForm(null, data);
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("budget_amount");
  });
  it("guarda estado, presupuesto, autorizacion explicita y pruebas en una sola operacion", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.rpc.mockResolvedValue({ data: { id: "10000000-0000-4000-8000-000000000001", version: 7, status: "listo_para_retirar", replayed: false }, error: null });
    const data = form(); data.set("status", "listo_para_retirar"); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", "208000"); data.set("budgetDetail", "Cambio de main"); data.set("confirmCustomer", "on");
    data.set("decisionChannel", "telefono"); data.set("decisionNotes", "Cliente autorizo"); data.set("qualityChecked", "on");
    const result = await saveQuickWorkshopForm(null, data);
    expect(result).toMatchObject({ success: true, recordVersion: 7 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_save_quick", expect.objectContaining({
      p_expected_version: 3, p_confirm_customer: true, p_channel: "telefono", p_decision_notes: "Cliente autorizo",
      p_payload: expect.objectContaining({ status: "listo_para_retirar", budget_amount: 208000, quality_checked: true })
    }));
  });
  it("no permite que un tecnico confirme al cliente por la accion rapida", async () => {
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002"); data.set("confirmCustomer", "on"); data.set("decisionChannel", "presencial");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rechaza un guardado rapido sin identidad y no hace fallback parcial", async () => {
    expect((await saveQuickWorkshopForm(null, form())).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("el guardado rapido no sustituye un importe protegido ausente ni fabrica aprobacion", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "10000000-0000-4000-8000-000000000001", version: 4, status: "en_revision", replayed: false }, error: null });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("budget_amount");
    expect(mocks.rpc.mock.calls[0][1].p_confirm_customer).toBe(false);
  });
  it("no reemplaza por cero el importe de un campo protegido y ausente", async () => {
    expect((await saveWorkshopForm(null, form())).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("budget_amount");
  });
  it("envia el presupuesto ingresado sin marcar cobro, entrega ni aprobacion", async () => {
    const data = form(); data.set("repairAmount", "25000");
    await saveWorkshopForm(null, data);
    const payload = mocks.rpc.mock.calls[0][1].p_payload;
    expect(payload.budget_amount).toBe(25000);
    for (const key of ["is_paid", "picked_up_at", "approval_status"]) expect(payload).not.toHaveProperty(key);
  });
  it("muestra el conflicto y no invalida vistas como si hubiera guardado", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "40001", message: "stale" } });
    expect((await saveWorkshopForm(null, form())).message).toContain("otro dispositivo");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("explica al tecnico la confirmacion pendiente sin fabricar un guardado", async () => {
    const data = form(); data.set("status", "listo_para_retirar"); data.set("qualityChecked", "on");
    mocks.rpc.mockResolvedValue({ error: { code: "23514", message: "Registra una autorizacion vigente del cliente antes de marcar listo para retirar." } });
    const result = await saveWorkshopForm(null, data);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Cliente confirmo");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("approval_status");
  });
  it("toma una orden con la version exacta y sin aceptar un responsable arbitrario", async () => {
    const data = form(); data.set("version", "3"); data.set("technicianId", "otra-persona");
    await claimRepairOrder(null, data);
    expect(mocks.rpc.mock.calls[0]).toEqual(["workshop_claim_order", { p_order_id: "10000000-0000-4000-8000-000000000001", p_expected_version: 3 }]);
  });
});
