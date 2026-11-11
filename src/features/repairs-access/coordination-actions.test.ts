import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), from: vi.fn(), linked: vi.fn(), native: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission, requireAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveWorkshopForm, saveQuickWorkshopForm, claimRepairOrder, deliverRepairOrder } from "./coordination-actions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ id: "tech", role: "tecnico" });
  mocks.admin.mockResolvedValue({ id: "admin", role: "admin" });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  mocks.linked.mockResolvedValue({ data: [{ id: "financial", final_price: 100, repair_payments: [{ amount: 100 }] }], error: null });
  mocks.native.mockResolvedValue({ data: { final_amount: 0, approved_amount: null, budget_amount: 0, repair_access_payments: [] }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = { select: () => query, eq: (column: string, value: unknown) => { mocks.eq(table, column, value); return query; }, limit: mocks.linked, maybeSingle: mocks.native };
    return query;
  });
});
function form() { const data = new FormData(); data.set("id", "10000000-0000-4000-8000-000000000001"); data.set("status", "en_revision"); data.set("expectedVersion", "3"); return data; }
describe.each([
  ["coordinacion", deliverRepairOrder, "notes"],
  ["editor rapido", saveQuickWorkshopForm, "deliveryNotes"]
] as const)("saldo real antes de entregar desde %s", (_label, deliver, notesField) => {
  function deliveryForm() {
    const data = form();
    data.set("status", "retirado"); data.set("version", "3");
    data.set("recipient", "Cliente"); data.set("confirmDelivery", "on");
    return data;
  }
  beforeEach(() => { mocks.permission.mockResolvedValue({ id: "admin", role: "admin" }); });

  it("lee el saldo canonico cero antes del RPC y conserva la version de entrega", async () => {
    const data = deliveryForm();
    expect((await deliver(null, data)).success).toBe(true);
    expect(mocks.eq).toHaveBeenCalledWith("repairs", "repair_access_order_id", data.get("id"));
    expect(mocks.linked).toHaveBeenCalledWith(2);
    expect(mocks.linked.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_deliver", {
      p_order_id: data.get("id"), p_expected_version: 3, p_recipient: "Cliente", p_notes: "", p_allow_balance: false
    });
    expect(mocks.native).not.toHaveBeenCalled();
  });

  it("bloquea deuda canonica aunque is_paid sea true y el formulario declare saldo cero", async () => {
    mocks.linked.mockResolvedValue({ data: [{ id: "financial", final_price: 100, repair_payments: [{ amount: 20 }],
      repair_access_orders: { is_paid: true, final_amount: 0, budget_amount: 0, repair_access_payments: [] } }], error: null });
    const data = deliveryForm(); data.set("isPaid", "on"); data.set("balance", "0"); data.set("repairAmount", "0");
    data.set(notesField, "Nota sin autorizar entrega con deuda");
    const result = await deliver(null, data);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/saldo pendiente/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("autoriza deuda positiva solo con checkbox y motivo, sin escribir cobros", async () => {
    mocks.linked.mockResolvedValue({ data: [{ id: "financial", final_price: 100, repair_payments: [] }], error: null });
    const data = deliveryForm(); data.set("allowBalance", "on"); data.set(notesField, "Abona el viernes");
    expect((await deliver(null, data)).success).toBe(true);
    expect(mocks.linked).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_deliver", expect.objectContaining({
      p_expected_version: 3, p_allow_balance: true, p_notes: "Abona el viernes"
    }));
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("repairs");
  });

  it.each(["", "  ", " ab "])("rechaza una autorizacion de deuda sin motivo suficiente (%j)", async (notes) => {
    const data = deliveryForm(); data.set("allowBalance", "on"); data.set(notesField, notes);
    expect((await deliver(null, data)).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("no permite omitir la lectura aunque haya autorizacion de saldo", async () => {
    mocks.linked.mockResolvedValue({ data: null, error: { message: "No se puede leer el registro" } });
    const data = deliveryForm(); data.set("allowBalance", "on"); data.set(notesField, "Autorizado hasta el viernes");
    expect(await deliver(null, data)).toMatchObject({ success: false, message: expect.stringMatching(/verificar.*saldo/i) });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("falla cerrado ante registros financieros vinculados ambiguos", async () => {
    mocks.linked.mockResolvedValue({ data: [{ id: "one", final_price: 0 }, { id: "two", final_price: 0 }], error: null });
    expect((await deliver(null, deliveryForm())).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.native).not.toHaveBeenCalled();
  });

  it("sin vinculo deriva el saldo de los cobros nativos no anulados, no de is_paid", async () => {
    mocks.linked.mockResolvedValue({ data: [], error: null });
    mocks.native.mockResolvedValue({ data: { is_paid: true, final_amount: 100, approved_amount: 100, budget_amount: 100,
      repair_access_payments: [
        { id: "partial", amount: 20, voided_at: null },
        { id: "void", amount: 80, voided_at: "2026-11-11" }
      ] }, error: null });
    expect((await deliver(null, deliveryForm())).success).toBe(false);
    expect(mocks.eq).toHaveBeenCalledWith("repair_access_orders", "id", form().get("id"));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { final_amount: 0, approved_amount: null, budget_amount: 0, repair_access_payments: [] },
    { final_amount: 100, approved_amount: 100, budget_amount: 100, repair_access_payments: [{ id: "paid", amount: 100, voided_at: null }] },
    { final_amount: 0.3, approved_amount: null, budget_amount: 0.3, repair_access_payments: [{ id: "one", amount: 0.1, voided_at: null }, { id: "two", amount: 0.2, voided_at: null }] }
  ])("permite saldo nativo cero sin asumir un pago legado: %j", async (native) => {
    mocks.linked.mockResolvedValue({ data: [], error: null });
    mocks.native.mockResolvedValue({ data: { ...native, is_paid: false }, error: null });
    expect((await deliver(null, deliveryForm())).success).toBe(true);
    expect(mocks.native).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_deliver", expect.objectContaining({ p_allow_balance: false }));
  });

  it("conserva los cargos nativos positivos cuando el importe final legado es cero", async () => {
    mocks.linked.mockResolvedValue({ data: [], error: null });
    mocks.native.mockResolvedValue({ data: { final_amount: 0, approved_amount: 80, budget_amount: 70, repair_access_payments: [] }, error: null });
    expect((await deliver(null, deliveryForm())).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: "Lectura denegada" } },
    { data: null, error: null },
    { data: { final_amount: 100, approved_amount: null, budget_amount: 100 }, error: null },
    { data: { final_amount: 100, approved_amount: null, budget_amount: 100, repair_access_payments: [{ id: "bad", amount: null, voided_at: null }] }, error: null }
  ])("no entrega ante lectura nativa fallida o incompleta: %j", async (response) => {
    mocks.linked.mockResolvedValue({ data: [], error: null }); mocks.native.mockResolvedValue(response);
    expect(await deliver(null, deliveryForm())).toMatchObject({ success: false, message: expect.stringMatching(/verificar.*saldo/i) });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("no lee el saldo ni entrega sin administracion autenticada", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Sin permiso"));
    mocks.permission.mockResolvedValue({ id: "tech", role: "tecnico" });
    if (deliver === deliverRepairOrder) await expect(deliver(null, deliveryForm())).rejects.toThrow("Sin permiso");
    else expect((await deliver(null, deliveryForm())).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["id", "recipient", "confirmDelivery"])("no lee ni entrega con %s invalido", async (field) => {
    const data = deliveryForm(); data.delete(field);
    expect((await deliver(null, data)).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("guardado breve del taller", () => {
  it("confirma con un solo checkbox sin inventar el canal de la conversacion", async () => {
    mocks.permission.mockResolvedValue({ role: "admin" });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", "100"); data.set("confirmCustomer", "on");
    mocks.rpc.mockResolvedValue({ data: { id: data.get("id"), version: 4, status: "en_revision", replayed: false }, error: null });
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_confirm_customer: true, p_channel: "registro" });
  });
  it("la seleccion aceptada confirma el importe protegido sin enviarlo como cero", async () => {
    mocks.permission.mockResolvedValue({ role: "admin" });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002"); data.set("status", "presupuestado_aceptado");
    mocks.rpc.mockResolvedValue({ data: { id: data.get("id"), version: 4, status: "presupuestado_aceptado", replayed: false }, error: null });
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_quick", expect.objectContaining({ p_confirm_customer: true, p_channel: "registro" }));
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("budget_amount");
  });
  it("envia garantia explicita y valida, sin asumir garantia en formularios antiguos", async () => {
    mocks.permission.mockResolvedValue({ role: "admin" });
    const data = form(); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("warrantyIncluded", "1"); data.set("hasWarranty", "on"); data.set("warrantyDays", "90"); data.set("warrantyConditions", "Solo fuente");
    await saveQuickWorkshopForm(null, data);
    expect(mocks.rpc.mock.calls[0][1].p_payload).toMatchObject({ has_warranty: true, warranty_days: 90, warranty_conditions: "Solo fuente" });
    mocks.rpc.mockClear(); data.set("warrantyDays", "0");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["tecnico", "admin"])("guarda no presenta fallas como %s sin presupuesto ni confirmacion", async (role) => {
    mocks.permission.mockResolvedValue({ id: role, role });
    const data = form(); data.set("status", "no_presenta_fallas"); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    mocks.rpc.mockResolvedValue({ data: { id: data.get("id"), version: 4, status: "no_presenta_fallas", replayed: false }, error: null });
    expect(await saveQuickWorkshopForm(null, data)).toMatchObject({ success: true, recordVersion: 4 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_quick", expect.objectContaining({
      p_payload: { status: "no_presenta_fallas" }, p_confirm_customer: false, p_channel: "", p_decision_notes: ""
    }));
  });
  it.each([saveQuickWorkshopForm, saveWorkshopForm])("no envia importes ni detalle antiguos al guardar no presenta fallas", async (save) => {
    const data = form(); data.set("status", "no_presenta_fallas"); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", "-999"); data.set("budgetDetail", "x".repeat(2001));
    data.set("confirmCustomer", "on"); data.set("decisionChannel", "invalido"); data.set("decisionNotes", "x".repeat(2001));
    data.set("issueReported", "Falla reemplazada"); data.set("isPaid", "on"); data.set("finalAmount", "0");
    data.set("repairProgress", "Revisado sin reproducir la falla");
    mocks.rpc.mockResolvedValue({ data: { id: data.get("id"), version: 4, status: "no_presenta_fallas", replayed: false }, error: null });
    expect((await save(null, data)).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_payload).toEqual({ status: "no_presenta_fallas", repair_progress: "Revisado sin reproducir la falla" });
    if (save === saveQuickWorkshopForm) expect(mocks.rpc.mock.calls[0][1].p_confirm_customer).toBe(false);
  });
  it("exige confirmacion y motivo explicitos en la entrega desde coordinacion", async () => {
    const data = form(); data.set("version", "3"); data.set("recipient", "Cliente");
    expect((await deliverRepairOrder(null, data)).success).toBe(false);
    data.set("confirmDelivery", "on"); data.set("allowBalance", "on");
    expect((await deliverRepairOrder(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    data.set("notes", "Saldo autorizado hasta el viernes");
    expect((await deliverRepairOrder(null, data)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_deliver", {
      p_order_id: data.get("id"), p_expected_version: 3, p_recipient: "Cliente",
      p_notes: "Saldo autorizado hasta el viernes", p_allow_balance: true
    });
  });

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
  it("no reintenta con saldo autorizado si la entrega rechaza un cobro pendiente", async () => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", "retirado"); data.set("recipient", "Cliente"); data.set("confirmDelivery", "on");
    mocks.rpc.mockResolvedValue({ error: { code: "23514", message: "Hay un cobro pendiente. Cobra o autoriza la entrega con saldo." } });
    expect(await saveQuickWorkshopForm(null, data)).toEqual({ success: false, message: "Hay un cobro pendiente. Cobra o autoriza la entrega con saldo." });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_deliver", expect.objectContaining({ p_allow_balance: false }));
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
      p_order_id: data.get("id"), p_expected_version: 3, p_operation_id: data.get("operationId"),
      p_confirm_customer: true, p_channel: "telefono", p_decision_notes: "Respuesta del cliente",
      p_payload: expect.objectContaining({ status, budget_amount: 100 })
    }));
    expect(result.message).toContain(status.endsWith("aceptado") ? "aceptado" : "rechazado");
  });
  it.each(["presupuestado_aceptado", "presupuestado_rechazado"])("no registra %s con presupuesto vacio como si fuera sin cargo", async (status) => {
    mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
    const data = form(); data.set("status", status); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", ""); data.set("decisionChannel", "presencial");
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("envia el cero y su motivo al aceptar explicitamente en el mismo RPC", async () => {
    mocks.permission.mockResolvedValue({ role: "admin" });
    const data = form(); data.set("status", "presupuestado_aceptado"); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    data.set("repairAmount", "0"); data.set("budgetDetail", "Reparacion de cortesia"); data.set("decisionNotes", "Cortesia autorizada");
    mocks.rpc.mockResolvedValue({ data: { id: data.get("id"), version: 4, status: "presupuestado_aceptado", replayed: false }, error: null });
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_quick", expect.objectContaining({
      p_confirm_customer: true, p_decision_notes: "Cortesia autorizada",
      p_payload: expect.objectContaining({ budget_amount: 0, budget_detail: "Reparacion de cortesia" })
    }));
  });
  it("reintenta la aceptacion con la misma identidad y respeta el recibo idempotente", async () => {
    mocks.permission.mockResolvedValue({ role: "admin" });
    const data = form(); data.set("status", "presupuestado_aceptado"); data.set("operationId", "10000000-0000-4000-8000-000000000002"); data.set("repairAmount", "150");
    mocks.rpc.mockResolvedValueOnce({ error: { code: "08006", message: "Conexion interrumpida" } })
      .mockResolvedValueOnce({ data: { id: data.get("id"), version: 6, status: "presupuestado_aceptado", replayed: true }, error: null });
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(false);
    expect(await saveQuickWorkshopForm(null, data)).toMatchObject({ success: true, recordVersion: 6, message: "Este cambio ya estaba guardado. Ficha actualizada." });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_operation_id: data.get("operationId"), p_expected_version: 3, p_confirm_customer: true });
  });
  it.each([
    ["presupuestado_aceptado", "Indica el motivo del trabajo sin cargo.", ""],
    ["presupuestado_rechazado", "Indica el motivo del rechazo para dejar registrada la revocacion de la aceptacion anterior.", ""],
    ["presupuestado_aceptado", "El importe cobrado esta protegido.", ""],
    ["listo_para_retirar", "Completa el control de calidad antes de marcar listo para retirar.", "on"]
  ])("mantiene el bloqueo de base al guardar %s: %s", async (status, message, confirmCustomer) => {
    mocks.permission.mockResolvedValue({ role: "admin" });
    const data = form(); data.set("status", status); data.set("operationId", "10000000-0000-4000-8000-000000000002"); data.set("confirmCustomer", confirmCustomer);
    mocks.rpc.mockResolvedValue({ error: { code: "23514", message } });
    const result = await saveQuickWorkshopForm(null, data);
    expect(result.success).toBe(false);
    expect(result.message).toContain(status === "listo_para_retirar" ? "Falta probar el equipo" : "Tus datos siguen disponibles para reintentar");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_quick", expect.objectContaining({ p_confirm_customer: true }));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(["presupuestado_aceptado", "presupuestado_rechazado"])("un tecnico conserva %s sin fabricar una respuesta del cliente", async (status) => {
    const data = form(); data.set("status", status); data.set("operationId", "10000000-0000-4000-8000-000000000002");
    mocks.rpc.mockResolvedValue({ data: { id: data.get("id"), version: 4, status, replayed: false }, error: null });
    expect((await saveQuickWorkshopForm(null, data)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_save_quick", expect.objectContaining({ p_confirm_customer: false, p_channel: "", p_decision_notes: "" }));
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
