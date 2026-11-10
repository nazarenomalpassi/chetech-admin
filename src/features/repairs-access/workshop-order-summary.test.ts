import { describe, expect, it } from "vitest";
import type { RepairAccessOrderRecord } from "./queries";
import type { WorkshopOrderContext, WorkshopPart } from "./workflow";
import type { WarrantyReturnRecord } from "./warranty-return";
import { getWorkshopOrderSummary } from "./workshop-order-summary";

const workflow: WorkshopOrderContext = {
  version: 2, budgetRevision: 1, approvalStatus: "accepted", approvedAmount: 120000,
  assignedTechnicianId: null, assignedTechnicianName: null, location: "Estante TV", nextActionDate: "2026-11-12",
  qualityCheckedAt: null, qualityNotes: null, parts: [], events: []
};
const part: WorkshopPart = {
  id: "part-1", orderId: "order-1", description: "Tiras LED", quantity: 2, receivedQuantity: 1, installedQuantity: 0,
  status: "ordered", priority: "normal", supplier: null, expectedDate: null, notes: null, unitCost: null,
  productId: null, version: 1, createdAt: "2026-11-10T12:00:00Z"
};
const record: WarrantyReturnRecord = {
  id: "return-1", orderId: "order-1", repairNumber: "REP-000742", customerName: "Ana", deviceLabel: "TV",
  receivedOn: "2026-11-10", issueReported: "Volvio a apagarse", accessories: "Control", conditionNotes: "",
  status: "en_revision", progress: "Revisando fuente", resolution: "", closedAt: null, recipient: null,
  version: 1, createdAt: "2026-11-10T12:00:00Z"
};
const order: Pick<RepairAccessOrderRecord, "status" | "deliveredAt" | "workflow" | "warrantyReturns"> = {
  status: "presupuestado", deliveredAt: null, workflow
};

describe("operational summary of the current workshop visit", () => {
  it("does not claim an accepted quote is waiting for authorization", () => {
    const result = getWorkshopOrderSummary(order);
    expect(result.nextAction).toBe("Continuar trabajo autorizado");
    expect(result.blockers).toEqual([]);
    expect(result.location).toBe("Estante TV");
    expect(result.nextActionDate).toBe("2026-11-12");
  });

  it.each(["legacy", "pending", "revoked", "rejected"] as const)("does not invent authorization for %s approval", (approvalStatus) => {
    const result = getWorkshopOrderSummary({ ...order, workflow: { ...workflow, approvalStatus } });
    expect(result.blockers).toContain("Esperando autorizacion del cliente");
    expect(result.nextAction).toBe("Consultar autorizacion del cliente");
  });

  it("includes both real blockers when a quote has pending authorization and incomplete receipts", () => {
    const result = getWorkshopOrderSummary({ ...order, workflow: { ...workflow, approvalStatus: "pending", parts: [part] } });
    expect(result.blockers).toEqual(["Esperando autorizacion del cliente", "Faltan repuestos por recibir"]);
    expect(result.nextAction).toBe("Gestionar repuestos pendientes");
  });

  it("does not confuse installation with receipt or count cancelled parts", () => {
    const result = getWorkshopOrderSummary({ ...order, workflow: { ...workflow, parts: [
      { ...part, receivedQuantity: 2, status: "received" }, { ...part, status: "cancelled" }
    ] } });
    expect(result.blockers).toEqual([]);
    expect(result.nextAction).toBe("Continuar trabajo autorizado");
  });

  it("does not block an undiagnosed intake on a missing technician or an absent quote", () => {
    const result = getWorkshopOrderSummary({ status: "pendiente_revision", deliveredAt: null });
    expect(result.nextAction).toBe("Revisar y preparar presupuesto");
    expect(result.blockers).toEqual([]);
    expect(result.location).toBeNull();
    expect(result.nextActionDate).toBeNull();
  });

  it.each(["no_presenta_fallas", "sin_solucion", "presupuestado_rechazado"])("coordinates return for %s instead of blocking on old technical tasks", (status) => {
    const result = getWorkshopOrderSummary({ ...order, status, workflow: { ...workflow, approvalStatus: "pending", parts: [part] } });
    expect(result.nextAction).toBe("Coordinar devolucion del equipo");
    expect(result.blockers).toEqual([]);
  });

  it("does not show historical reminders or blockers as current work on a delivered original", () => {
    const result = getWorkshopOrderSummary({ ...order, deliveredAt: "2026-10-10T12:00:00Z",
      workflow: { ...workflow, approvalStatus: "pending", parts: [part] }
    });
    expect(result.nextAction).toBe("Equipo entregado");
    expect(result.blockers).toEqual([]);
    expect(result.nextActionDate).toBeNull();
  });

  it.each([
    ["pendiente_revision", "Revisar la falla del reingreso"],
    ["en_revision", "Revisar la falla del reingreso"],
    ["en_reparacion", "Registrar avance del reingreso"],
    ["en_pruebas", "Probar el equipo del reingreso"],
    ["listo_para_retirar", "Coordinar retiro de garantia"],
    ["no_presenta_fallas", "Coordinar devolucion del reingreso"],
    ["sin_solucion", "Coordinar devolucion del reingreso"]
  ] as const)("uses the %s warranty visit instead of the delivered original", (status, nextAction) => {
    const active = { ...record, status };
    const result = getWorkshopOrderSummary({ ...order, status: "retirado", deliveredAt: "2026-10-01T12:00:00Z",
      warrantyReturns: [active], workflow: { ...workflow, approvalStatus: "revoked", parts: [part] }
    });
    expect(result.status).toBe(status);
    expect(result.activeReturn).toBe(active);
    expect(result.nextAction).toBe(nextAction);
    expect(result.blockers).toEqual([]);
    expect(result.location).toBeNull();
    expect(result.nextActionDate).toBeNull();
  });

  it("ignores closed warranty visits without modifying the original order or arrays", () => {
    const source = { ...order, warrantyReturns: [{ ...record, status: "retirado" as const, closedAt: "2026-11-10T12:00:00Z" }] };
    const snapshot = structuredClone(source);
    const result = getWorkshopOrderSummary(source);
    expect(result.activeReturn).toBeNull();
    expect(result.status).toBe("presupuestado");
    expect(source).toEqual(snapshot);
  });
});
