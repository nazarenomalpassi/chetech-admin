import type { VisitStatusValue } from "@/features/visits/schemas";

export type VisitRecord = {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  visitDate: string;
  timeFrom: string;
  timeTo: string;
  reason: string;
  notes: string;
  status: VisitStatusValue;
  createdAt: string;
};

const closedStatuses = new Set<VisitStatusValue>(["realizada", "cancelada"]);

export const visitStatusLabels: Record<VisitStatusValue, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  en_camino: "En camino",
  realizada: "Realizada",
  cancelada: "Cancelada"
};

export function getVisitTimeLabel(timeFrom: string, timeTo: string) {
  return `${timeFrom.slice(0, 5)} a ${timeTo.slice(0, 5)}`;
}

function getVisitPriority(visit: VisitRecord, today: string) {
  if (visit.visitDate === today && !closedStatuses.has(visit.status)) return 0;
  if (visit.visitDate > today && !closedStatuses.has(visit.status)) return 1;
  if (visit.visitDate < today && !closedStatuses.has(visit.status)) return 2;
  if (visit.visitDate === today) return 3;
  return 4;
}

export function sortVisitsForAgenda(visits: VisitRecord[], today: string) {
  return [...visits].sort((left, right) => {
    const priorityDiff = getVisitPriority(left, today) - getVisitPriority(right, today);
    if (priorityDiff !== 0) return priorityDiff;

    const dateDiff = left.visitDate.localeCompare(right.visitDate);
    if (dateDiff !== 0) return dateDiff;

    const timeDiff = left.timeFrom.localeCompare(right.timeFrom);
    if (timeDiff !== 0) return timeDiff;

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function buildVisitSummary(visits: VisitRecord[], today: string) {
  const sorted = sortVisitsForAgenda(visits, today);
  const todayVisits = sorted.filter((visit) => visit.visitDate === today);
  const nextVisit =
    todayVisits.find((visit) => !closedStatuses.has(visit.status)) ??
    sorted.find((visit) => visit.visitDate > today && !closedStatuses.has(visit.status)) ??
    null;

  return {
    todayCount: todayVisits.length,
    pendingCount: todayVisits.filter((visit) => !closedStatuses.has(visit.status)).length,
    nextVisit
  };
}
