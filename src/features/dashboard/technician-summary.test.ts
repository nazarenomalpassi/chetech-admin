import { describe, expect, it } from "vitest";

import { buildTechnicianRepairSummary } from "@/features/dashboard/technician-summary";

describe("dashboard tecnico", () => {
  it("mantiene equipos rechazados y sin solucion en custodia hasta su entrega", () => {
    const result = buildTechnicianRepairSummary([
      { status: "presupuestado_rechazado", technicianId: "tech-1" },
      { status: "sin_solucion", technicianId: "tech-1" },
      { status: "retirado", technicianId: "tech-1" }
    ], "tech-1");
    expect(result.active).toBe(2);
    expect(result.assigned).toBe(2);
  });
  it("resume solo carga operativa de reparaciones", () => {
    const result = buildTechnicianRepairSummary(
      [
        { status: "pendiente_revision", technicianId: null },
        { status: "en_revision", technicianId: "tech-1" },
        { status: "listo_para_retirar", technicianId: "tech-1" },
        { status: "retirado", technicianId: "tech-1" }
      ],
      "tech-1"
    );

    expect(result).toEqual({
      active: 3,
      assigned: 2,
      pendingReview: 1,
      readyToPickup: 1
    });
  });
});
