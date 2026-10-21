import { describe, expect, it } from "vitest";

import { parseVisitNotes, serializeVisitNotes, visitFormSchema } from "@/features/visits/schemas";

describe("tools stored in existing visit notes", () => {
  it("round trips the checklist without changing a byte of legacy notes", () => {
    const notes = "  Tocar timbre\nNo retirar sin aviso  ";
    const stored = serializeVisitNotes({ notes, toolsRequired: "yes", toolsDetail: "Escalera\nTester" });
    expect(parseVisitNotes(stored)).toEqual({ notes, toolsRequired: "yes", toolsDetail: "Escalera\nTester" });
    expect(serializeVisitNotes({ notes, toolsRequired: "", toolsDetail: "" })).toBe(notes);
  });
  it("does not interpret legacy prose or malformed metadata as a checklist", () => {
    const notes = 'Herramientas: escalera\n[chetech:visit-tools:v1]\ninvalid';
    expect(parseVisitNotes(notes)).toEqual({ notes, toolsRequired: "", toolsDetail: "" });
  });
  it("recovers the checklist when a technician appended a normal note after its metadata", () => {
    const stored = serializeVisitNotes({ notes: "Tocar timbre", toolsRequired: "yes", toolsDetail: "Escalera y tester" });
    expect(parseVisitNotes(`${stored}\nRevision realizada`)).toEqual({ notes: "Tocar timbre\nRevision realizada", toolsRequired: "yes", toolsDetail: "Escalera y tester" });
  });
});

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
