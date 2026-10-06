import { repairOutsourcingStatusValues } from "@/features/outsourcings/schemas";

export type RepairOutsourcingStatus = (typeof repairOutsourcingStatusValues)[number];

type StatusTone = "default" | "success" | "warning" | "danger";

export const repairOutsourcingStatusMeta: Record<RepairOutsourcingStatus, { label: string; tone: StatusTone }> = {
  en_taller: { label: "En taller externo", tone: "warning" },
  retirado: { label: "Buscado / retirado", tone: "success" },
  cancelado: { label: "Anulado", tone: "danger" }
};

export function getRepairOutsourcingStatusLabel(status: string) {
  return repairOutsourcingStatusMeta[status as RepairOutsourcingStatus]?.label ?? status.replaceAll("_", " ");
}

export function getRepairOutsourcingStatusTone(status: string): StatusTone {
  return repairOutsourcingStatusMeta[status as RepairOutsourcingStatus]?.tone ?? "default";
}
