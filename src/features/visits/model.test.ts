import { describe, expect, it } from "vitest";

import { buildVisitSummary, sortVisitsForAgenda } from "@/features/visits/model";

describe("sortVisitsForAgenda", () => {
  it("prioriza visitas de hoy y deja realizadas o canceladas al final", () => {
    const sorted = sortVisitsForAgenda(
      [
        {
          id: "4",
          customerName: "Cancelado",
          customerPhone: "1",
          address: "Dir 4",
          visitDate: "2026-07-09",
          timeFrom: "11:00:00",
          timeTo: "12:00:00",
          reason: "Otro",
          notes: "",
          status: "cancelada",
          createdAt: "2026-07-01T10:00:00.000Z"
        },
        {
          id: "2",
          customerName: "Hoy temprano",
          customerPhone: "1",
          address: "Dir 2",
          visitDate: "2026-07-08",
          timeFrom: "09:00:00",
          timeTo: "10:00:00",
          reason: "Buscar TV",
          notes: "",
          status: "pendiente",
          createdAt: "2026-07-01T10:00:00.000Z"
        },
        {
          id: "1",
          customerName: "Proxima",
          customerPhone: "1",
          address: "Dir 1",
          visitDate: "2026-07-09",
          timeFrom: "15:00:00",
          timeTo: "18:00:00",
          reason: "Revisar TV",
          notes: "",
          status: "confirmada",
          createdAt: "2026-07-01T10:00:00.000Z"
        },
        {
          id: "3",
          customerName: "Realizada",
          customerPhone: "1",
          address: "Dir 3",
          visitDate: "2026-07-08",
          timeFrom: "18:00:00",
          timeTo: "19:00:00",
          reason: "Otro",
          notes: "",
          status: "realizada",
          createdAt: "2026-07-01T10:00:00.000Z"
        }
      ],
      "2026-07-08"
    );

    expect(sorted.map((visit) => visit.customerName)).toEqual([
      "Hoy temprano",
      "Proxima",
      "Realizada",
      "Cancelado"
    ]);
  });
});

describe("buildVisitSummary", () => {
  it("resume las visitas de hoy y detecta la proxima visita no cerrada", () => {
    const summary = buildVisitSummary(
      [
        {
          id: "1",
          customerName: "Juan Perez",
          customerPhone: "1",
          address: "Dir 1",
          visitDate: "2026-07-08",
          timeFrom: "15:00:00",
          timeTo: "18:00:00",
          reason: "Buscar TV",
          notes: "",
          status: "pendiente",
          createdAt: "2026-07-01T10:00:00.000Z"
        },
        {
          id: "2",
          customerName: "Ana",
          customerPhone: "1",
          address: "Dir 2",
          visitDate: "2026-07-08",
          timeFrom: "09:00:00",
          timeTo: "12:00:00",
          reason: "Revisar TV",
          notes: "",
          status: "realizada",
          createdAt: "2026-07-01T10:00:00.000Z"
        }
      ],
      "2026-07-08"
    );

    expect(summary.todayCount).toBe(2);
    expect(summary.pendingCount).toBe(1);
    expect(summary.nextVisit?.customerName).toBe("Juan Perez");
  });
});
