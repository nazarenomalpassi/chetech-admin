import type { AppRole } from "@/lib/permissions";

export type WorkshopPart = {
  id: string;
  orderId: string;
  description: string;
  quantity: number;
  receivedQuantity: number;
  installedQuantity: number;
  status: "requested" | "ordered" | "received" | "installed" | "cancelled";
  priority: string;
  supplier: string | null;
  expectedDate: string | null;
  notes: string | null;
  unitCost: number | null;
  productId: string | null;
  version: number;
  createdAt: string;
};

export type WorkshopEvent = { id: string; kind: string; message: string; actorName: string; createdAt: string };
export type WorkshopOrderContext = {
  version: number;
  budgetRevision: number;
  approvalStatus: "legacy" | "pending" | "accepted" | "rejected" | "revoked";
  approvedAmount: number | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  location: string | null;
  nextActionDate: string | null;
  qualityCheckedAt: string | null;
  qualityNotes: string | null;
  parts: WorkshopPart[];
  events: WorkshopEvent[];
};

export const TECHNICAL_WORKSHOP_STATUSES = ["pendiente_revision", "en_revision", "presupuestado", "en_reparacion", "en_pruebas", "listo_para_retirar", "sin_solucion"];

export function canChooseWorkshopStatus(role: AppRole, status: string) {
  return role === "admin" || TECHNICAL_WORKSHOP_STATUSES.includes(status);
}

export function getPartOutstandingQuantity(part: Pick<WorkshopPart, "quantity" | "receivedQuantity" | "status">) {
  return part.status === "cancelled" ? 0 : Math.max(0, part.quantity - part.receivedQuantity);
}

export function validatePartReceipt(quantity: number, received: number, additional: number) {
  return Number.isInteger(additional) && additional > 0 && received + additional <= quantity;
}

export function getWorkshopNextAction(order: { status: string; deliveredAt: string | null; approvalStatus: string; pendingParts: number }) {
  if (order.deliveredAt || order.status === "retirado") return "Equipo entregado";
  if (["sin_solucion", "presupuestado_rechazado"].includes(order.status)) return "Coordinar devolucion del equipo";
  if (order.pendingParts > 0) return "Gestionar repuestos pendientes";
  if (order.status === "listo_para_retirar") return "Avisar y coordinar retiro";
  if (order.status === "presupuestado" || order.approvalStatus === "revoked") return "Consultar autorizacion del cliente";
  if (order.status === "en_pruebas") return "Completar control de calidad";
  if (order.status === "en_reparacion") return "Registrar avance de reparacion";
  if (order.approvalStatus === "accepted") return "Continuar trabajo autorizado";
  if (order.status === "presupuestado_aceptado") return "Consultar autorizacion del cliente";
  return "Revisar y preparar presupuesto";
}

export const PART_STATUS_LABELS = { requested: "Por gestionar", ordered: "Comprado", received: "Recibido", installed: "Utilizado", cancelled: "Cancelado" } as const;
