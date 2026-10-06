import { describe, expect, it } from "vitest";

import { visitFormSchema } from "@/features/visits/schemas";

describe("visitFormSchema", () => {
  const base = { customerName: "Juan", customerPhone: "341", address: "Local", visitDate: "2026-10-05", timeFrom: "09:00", timeTo: "10:00", reason: "Revision" };
  it.each(["2026-02-30", "not-a-date"])("rejects invalid calendar date %s", (visitDate) => {
    expect(visitFormSchema.safeParse({ ...base, visitDate }).success).toBe(false);
  });
  it.each(["25:00", "9:00", "aa:bb"])("rejects malformed time %s", (timeFrom) => {
    expect(visitFormSchema.safeParse({ ...base, timeFrom }).success).toBe(false);
  });
  it("validates and retains assignment and REP link", () => {
    const technicianId = "11111111-1111-4111-8111-111111111111";
    const result = visitFormSchema.parse({ ...base, technicianId, repairAccessOrderId: technicianId });
    expect(result).toMatchObject({ technicianId, repairAccessOrderId: technicianId });
    expect(visitFormSchema.safeParse({ ...base, technicianId: "wrong" }).success).toBe(false);
  });
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
