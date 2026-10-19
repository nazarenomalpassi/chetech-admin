import { describe, expect, it, vi } from "vitest";
import { canChooseWorkshopStatus, getWorkshopNextAction, getPartOutstandingQuantity, validatePartReceipt, getQuickWorkshopState, hasWorkshopDeliveryBalance } from "./workflow";
import { getRepairAccessStatusLabel, repairAccessLanes, repairAccessStatusMeta, repairAccessStatusOptions } from "./components/repair-access-helpers";
import { mapOrder } from "./queries";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

describe("coordinacion del taller", () => {
  it.each([
    { finalAmount: null, debt: true }, { finalAmount: 0, debt: true }, { finalAmount: 50, debt: true }
  ])("no descarta un presupuesto pendiente al registrar entrega sin fallas: %j", ({ finalAmount, debt }) => {
    const order = mapOrder({
      id: "10000000-0000-4000-8000-000000000001", status: "no_presenta_fallas", issue_reported: "Falla original",
      budget_amount: 100, final_amount: finalAmount, is_paid: false
    } as Parameters<typeof mapOrder>[0]);
    expect(order).toMatchObject({ hasFinalAmount: finalAmount !== null, issueReported: "Falla original" });
    expect(hasWorkshopDeliveryBalance(order)).toBe(debt);
  });
  it("ofrece no presenta fallas al tecnico y lo mantiene pendiente de devolucion", () => {
    expect(canChooseWorkshopStatus("tecnico", "no_presenta_fallas")).toBe(true);
    expect(getRepairAccessStatusLabel("no_presenta_fallas")).toBe("No presenta fallas");
    expect(repairAccessStatusOptions).toContainEqual({ value: "no_presenta_fallas", label: "No presenta fallas" });
    expect(repairAccessStatusMeta).toHaveProperty("no_presenta_fallas");
    expect(repairAccessLanes.find((lane) => lane.key === "salida")?.statuses).toContain("no_presenta_fallas");
    expect(getWorkshopNextAction({ status: "no_presenta_fallas", deliveredAt: null, approvalStatus: "revoked", pendingParts: 1 })).toBe("Coordinar devolucion del equipo");
  });
  it("ignora el presupuesto del borrador para no presenta fallas sin requerir aprobacion", () => {
    const order = { status: "en_revision", budgetAmount: 100, budgetDetail: "Fuente", isPaid: false };
    expect(getQuickWorkshopState(order, { status: "no_presenta_fallas", repairAmount: "999", budgetDetail: "Otro alcance" }))
      .toMatchObject({ quoteAmount: 100, quoteChanged: false, needsConfirmation: false });
  });

  it("pide confirmacion para presupuestos nuevos o modificados, no para avances de alcance vigente", () => {
    const order = { status: "presupuestado", budgetAmount: 100, budgetDetail: "Fuente", isPaid: false, workflow: { approvalStatus: "accepted", qualityCheckedAt: "2026-10-06" } };
    expect(getQuickWorkshopState(order, { repairProgress: "Probando" }).needsConfirmation).toBe(false);
    expect(getQuickWorkshopState(order, { repairAmount: "110" }).needsConfirmation).toBe(true);
    expect(getQuickWorkshopState(order, { budgetDetail: "Otra fuente" }).needsConfirmation).toBe(true);
    expect(getQuickWorkshopState({ ...order, workflow: { ...order.workflow, approvalStatus: "legacy" } }, {}).needsConfirmation).toBe(true);
  });
  it("no reutiliza un control de calidad de un alcance cambiado", () => {
    const order = { status: "en_pruebas", budgetAmount: 100, budgetDetail: "Fuente", isPaid: false, workflow: { approvalStatus: "accepted", qualityCheckedAt: "2026-10-06" } };
    expect(getQuickWorkshopState(order, {}).hasCurrentQuality).toBe(true);
    expect(getQuickWorkshopState(order, { repairAmount: "110" }).hasCurrentQuality).toBe(false);
  });
  it("muestra la tarea tecnica concreta de una orden autorizada", () => {
    expect(getWorkshopNextAction({ status: "en_pruebas", deliveredAt: null, approvalStatus: "accepted", pendingParts: 0 })).toBe("Completar control de calidad");
    expect(getWorkshopNextAction({ status: "en_reparacion", deliveredAt: null, approvalStatus: "accepted", pendingParts: 0 })).toBe("Registrar avance de reparacion");
  });
  it("reserva decisiones comerciales y entrega para mostrador", () => {
    expect(canChooseWorkshopStatus("tecnico", "presupuestado_aceptado")).toBe(false);
    expect(canChooseWorkshopStatus("tecnico", "retirado")).toBe(false);
    expect(canChooseWorkshopStatus("tecnico", "en_revision")).toBe(true);
  });
  it("mantiene pendientes de devolucion los equipos rechazados en el local", () => {
    expect(getWorkshopNextAction({ status: "presupuestado_rechazado", deliveredAt: null, approvalStatus: "legacy", pendingParts: 0 })).toBe("Coordinar devolucion del equipo");
  });
  it("no habilita trabajo autorizado cuando falta una parte", () => {
    expect(getWorkshopNextAction({ status: "presupuestado_aceptado", deliveredAt: null, approvalStatus: "accepted", pendingParts: 1 })).toBe("Gestionar repuestos pendientes");
  });
  it("no presenta una aceptacion historica como autorizacion vigente", () => {
    expect(getWorkshopNextAction({ status: "presupuestado_aceptado", deliveredAt: null, approvalStatus: "legacy", pendingParts: 0 })).toBe("Consultar autorizacion del cliente");
  });
  it("muestra el pedido restante despues de una recepcion parcial", () => {
    expect(getPartOutstandingQuantity({ quantity: 2, receivedQuantity: 1, status: "ordered" })).toBe(1);
    expect(validatePartReceipt(2, 1, 2)).toBe(false);
    expect(validatePartReceipt(2, 1, 1)).toBe(true);
  });
});
