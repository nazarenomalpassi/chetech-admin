import type { RepairAccessOrderRecord } from "./queries";
import { getPartOutstandingQuantity, getWorkshopNextAction } from "./workflow";

type SummaryOrder = Pick<RepairAccessOrderRecord, "status" | "deliveredAt" | "workflow" | "warrantyReturns">;

const warrantyNextActions = {
  pendiente_revision: "Revisar la falla del reingreso",
  en_revision: "Revisar la falla del reingreso",
  en_reparacion: "Registrar avance del reingreso",
  en_pruebas: "Probar el equipo del reingreso",
  listo_para_retirar: "Coordinar retiro de garantia",
  no_presenta_fallas: "Coordinar devolucion del reingreso",
  sin_solucion: "Coordinar devolucion del reingreso",
  retirado: "Reingreso entregado"
} as const;

export function getWorkshopOrderSummary(order: SummaryOrder) {
  const activeReturn = order.warrantyReturns?.find((record) => !record.closedAt) ?? null;
  if (activeReturn) {
    // Parts, approvals and reminders from the original repair do not describe this visit.
    return {
      activeReturn,
      status: activeReturn.status,
      nextAction: warrantyNextActions[activeReturn.status],
      blockers: [] as string[],
      location: null,
      nextActionDate: null
    };
  }

  const delivered = Boolean(order.deliveredAt) || order.status === "retirado";
  const returningWithoutRepair = ["no_presenta_fallas", "sin_solucion", "presupuestado_rechazado"].includes(order.status);
  const approvalStatus = order.workflow?.approvalStatus ?? "legacy";
  const pendingParts = delivered || returningWithoutRepair ? 0
    : (order.workflow?.parts ?? []).filter((part) => getPartOutstandingQuantity(part) > 0).length;
  const waitingApproval = !delivered && !returningWithoutRepair && approvalStatus !== "accepted"
    && (["presupuestado", "presupuestado_aceptado"].includes(order.status) || ["pending", "revoked"].includes(approvalStatus));
  const blockers: string[] = [];
  if (waitingApproval) blockers.push("Esperando autorizacion del cliente");
  if (pendingParts > 0) blockers.push("Faltan repuestos por recibir");
  const nextAction = !delivered && pendingParts === 0 && approvalStatus === "accepted"
    && ["presupuestado", "presupuestado_aceptado"].includes(order.status)
    ? "Continuar trabajo autorizado"
    : getWorkshopNextAction({ status: order.status, deliveredAt: order.deliveredAt, approvalStatus, pendingParts });

  return {
    activeReturn,
    status: order.status,
    nextAction,
    blockers,
    location: order.workflow?.location?.trim() || null,
    nextActionDate: delivered ? null : order.workflow?.nextActionDate || null
  };
}

export type WorkshopOrderSummary = ReturnType<typeof getWorkshopOrderSummary>;
