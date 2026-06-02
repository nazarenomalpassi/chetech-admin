import { repairAccessStatusValues } from "@/features/repairs-access/schemas";

export const repairAccessPaymentOptions = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nx", label: "NX SANTI" },
  { value: "mp", label: "NX LOCAL" }
] as const;

export const repairAccessPriorityOptions = [
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
  { value: "seguro", label: "Seguro" }
] as const;

export type RepairAccessStatus = (typeof repairAccessStatusValues)[number];

type StatusTone = "default" | "success" | "warning" | "danger";

export const repairAccessStatusMeta: Record<RepairAccessStatus, { label: string; shortLabel: string; tone: StatusTone; lane: string }> = {
  pendiente_revision: { label: "Pendiente de revisión", shortLabel: "Pendiente", tone: "warning", lane: "Recepción" },
  en_revision: { label: "En revisión", shortLabel: "Revisión", tone: "warning", lane: "Técnica" },
  presupuestado: { label: "Presupuestado", shortLabel: "Presupuesto", tone: "default", lane: "Presupuesto" },
  presupuestado_aceptado: { label: "Presupuestado y aceptado", shortLabel: "Aceptado", tone: "success", lane: "Presupuesto" },
  presupuestado_rechazado: { label: "Presupuestado y rechazado", shortLabel: "Rechazado", tone: "danger", lane: "Presupuesto" },
  listo_para_retirar: { label: "Listo para retirar", shortLabel: "Retirar", tone: "success", lane: "Entrega" },
  comprado: { label: "Comprado", shortLabel: "Comprado", tone: "success", lane: "Cierre" },
  sin_solucion: { label: "Sin solución", shortLabel: "Sin solución", tone: "danger", lane: "Cierre" }
};

export const repairAccessStatusOptions = repairAccessStatusValues.map((status) => ({
  value: status,
  label: repairAccessStatusMeta[status].label
}));

export const repairAccessIntakeStatusOptions = repairAccessStatusOptions;

export const repairAccessClosedStatuses = ["comprado", "sin_solucion", "presupuestado_rechazado"] as const;

export const repairAccessLanes = [
  {
    key: "recepcion",
    title: "Recepción",
    description: "Ingreso del equipo, falla declarada y prioridad del mostrador.",
    statuses: ["pendiente_revision"]
  },
  {
    key: "tecnica",
    title: "Mesa técnica",
    description: "Revision, diagnostico, avance y decisiones del tecnico.",
    statuses: ["en_revision"]
  },
  {
    key: "presupuesto",
    title: "Presupuestos",
    description: "Presupuesto informado y respuesta del cliente.",
    statuses: ["presupuestado", "presupuestado_aceptado", "presupuestado_rechazado"]
  },
  {
    key: "salida",
    title: "Salida",
    description: "Equipo listo, comprado/cobrado o cerrado sin solucion.",
    statuses: ["listo_para_retirar", "comprado", "sin_solucion"]
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
