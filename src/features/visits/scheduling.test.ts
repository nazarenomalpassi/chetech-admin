import { describe, expect, it } from "vitest";
import { getVisitDateRange, visitsOverlap } from "@/features/visits/model";

describe("visit scheduling", () => {
  it("builds a Monday to Sunday range across month and year boundaries", () => {
    expect(getVisitDateRange("2027-01-03", "week")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(getVisitDateRange("2026-10-05", "day")).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(getVisitDateRange("bad", "week")).toBeNull();
  });
  it("blocks intersecting active visits of the same technician, not adjacent slots", () => {
    const a = { id: "1", technicianId: "tech", visitDate: "2026-10-05", timeFrom: "09:00", timeTo: "10:00", status: "confirmada" };
    const b = { ...a, id: "2", timeFrom: "09:30" };
    expect(visitsOverlap(a, b)).toBe(true);
    expect(visitsOverlap(a, { ...b, timeFrom: "10:00", timeTo: "11:00" })).toBe(false);
    expect(visitsOverlap(a, { ...b, technicianId: "other" })).toBe(false);
    expect(visitsOverlap(a, { ...b, status: "cancelada" })).toBe(false);
    expect(visitsOverlap(a, { ...b, status: "realizada" })).toBe(false);
    expect(visitsOverlap(a, a)).toBe(false);
    expect(visitsOverlap({ ...a, technicianId: "" }, { ...b, technicianId: "" })).toBe(false);
  });
});
