import { describe, expect, it } from "vitest";
import { canChooseWorkshopStatus, getWorkshopNextAction, getPartOutstandingQuantity, validatePartReceipt } from "./workflow";

describe("coordinacion del taller", () => {
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
