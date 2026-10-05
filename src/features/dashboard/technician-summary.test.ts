import { describe, expect, it } from "vitest";

import { buildTechnicianRepairSummary } from "@/features/dashboard/technician-summary";

describe("dashboard tecnico", () => {
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
