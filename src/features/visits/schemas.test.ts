import { describe, expect, it } from "vitest";

import { visitFormSchema } from "@/features/visits/schemas";

describe("visitFormSchema", () => {
  it("valida una visita completa con horario correcto", () => {
    const parsed = visitFormSchema.safeParse({
      customerName: "Juan Perez",
      customerPhone: "3415551234",
      address: "San Martin 123",
      visitDate: "2026-07-08",
      timeFrom: "15:00",
      timeTo: "18:00",
      reason: "Buscar TV",
      notes: "Tocar timbre"
    });

    expect(parsed.success).toBe(true);
  });

  it("rechaza una visita cuando la hora hasta no es posterior a la hora desde", () => {
    const parsed = visitFormSchema.safeParse({
      customerName: "Juan Perez",
      customerPhone: "3415551234",
      address: "San Martin 123",
      visitDate: "2026-07-08",
      timeFrom: "18:00",
      timeTo: "15:00",
      reason: "Buscar TV",
      notes: ""
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("posterior");
    }
  });
});
