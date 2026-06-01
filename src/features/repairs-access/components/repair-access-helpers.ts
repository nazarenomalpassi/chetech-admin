import { repairAccessStatusValues } from "@/features/repairs-access/schemas";

export const repairAccessPaymentOptions = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nx", label: "NX SANTI" },
  { value: "mp", label: "NX LOCAL" }
] as const;

export type RepairAccessStatus = (typeof repairAccessStatusValues)[number];

type StatusTone = "default" | "success" | "warning" | "danger";

export const repairAccessStatusMeta: Record<RepairAccessStatus, { label: string; shortLabel: string; tone: StatusTone; lane: string }> = {
  ingresado: { label: "Ingresado", shortLabel: "Ingresado", tone: "default", lane: "Recepcion" },
  pendiente_revision: { label: "Pendiente de revision", shortLabel: "Pendiente", tone: "warning", lane: "Recepcion" },
  en_revision: { label: "En revision", shortLabel: "Revision", tone: "warning", lane: "Tecnica" },
  presupuestado: { label: "Presupuestado", shortLabel: "Presupuesto", tone: "default", lane: "Presupuesto" },
  esperando_confirmacion_cliente: { label: "Esperando confirmacion", shortLabel: "Esperando", tone: "warning", lane: "Presupuesto" },
  aprobado_por_cliente: { label: "Aprobado por cliente", shortLabel: "Aprobado", tone: "success", lane: "Presupuesto" },
  rechazado_por_cliente: { label: "Rechazado por cliente", shortLabel: "Rechazado", tone: "danger", lane: "Presupuesto" },
  en_reparacion: { label: "En reparacion", shortLabel: "Reparacion", tone: "warning", lane: "Tecnica" },
  esperando_repuesto: { label: "Esperando repuesto", shortLabel: "Repuesto", tone: "warning", lane: "Tecnica" },
  terminado: { label: "Terminado", shortLabel: "Terminado", tone: "success", lane: "Entrega" },
  listo_para_retirar: { label: "Listo para retirar", shortLabel: "Retirar", tone: "success", lane: "Entrega" },
  entregado: { label: "Entregado", shortLabel: "Entregado", tone: "success", lane: "Cierre" },
  cobrado: { label: "Cobrado", shortLabel: "Cobrado", tone: "success", lane: "Cierre" },
  cancelado: { label: "Cancelado", shortLabel: "Cancelado", tone: "danger", lane: "Cierre" },
  dado_de_baja: { label: "Dado de baja", shortLabel: "Baja", tone: "danger", lane: "Cierre" }
};

export const repairAccessLanes = [
  {
    key: "recepcion",
    title: "Recepcion",
    description: "Ingreso, datos del cliente, equipo y falla declarada.",
    statuses: ["ingresado", "pendiente_revision"]
  },
  {
    key: "tecnica",
    title: "Mesa tecnica",
    description: "Revision, diagnostico, repuestos y reparacion.",
    statuses: ["en_revision", "en_reparacion", "esperando_repuesto"]
  },
  {
    key: "presupuesto",
    title: "Presupuestos",
    description: "Monto informado, respuesta del cliente y aprobaciones.",
    statuses: ["presupuestado", "esperando_confirmacion_cliente", "aprobado_por_cliente", "rechazado_por_cliente"]
  },
  {
    key: "entrega",
    title: "Entrega y cobro",
    description: "Equipos terminados, retiro, cobro y garantia.",
    statuses: ["terminado", "listo_para_retirar", "entregado", "cobrado"]
  }
] as const;

export function getRepairAccessStatusLabel(status: string) {
  return repairAccessStatusMeta[status as RepairAccessStatus]?.label ?? status.replaceAll("_", " ");
}

export function getRepairAccessStatusTone(status: string): StatusTone {
  return repairAccessStatusMeta[status as RepairAccessStatus]?.tone ?? "default";
}

export function getRepairAccessPaymentLabel(value?: string | null) {
  return repairAccessPaymentOptions.find((method) => method.value === value)?.label ?? value ?? "Sin medio";
}
