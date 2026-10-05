import { describe, expect, it } from "vitest";
import { getWorkshopCohort, workshopCategoryHref, workshopBusinessReportSchema } from "./model";
import { reportFixture } from "./test-fixture";

describe("workshop report contract", () => {
  it("defaults to the Argentina current intake month and normalizes inverted dates", () => {
    expect(getWorkshopCohort(undefined, undefined, new Date("2026-10-05T01:00:00Z"))).toMatchObject({ from: "2026-10-01", to: "2026-10-04" });
    expect(getWorkshopCohort("2026-10-05", "2026-10-01")).toMatchObject({ from: "2026-10-01", to: "2026-10-05" });
  });
  it("rejects invalid calendar dates instead of running an unbounded fallback", () => {
    expect(() => getWorkshopCohort("2026-02-30", "2026-10-05")).toThrow(/fecha/i);
  });
  it("links operational categories to supported REP scope filters without pretending to filter cohort dates", () => {
    expect(workshopCategoryHref("parts")).toBe("/reparaciones-access?view=ordenes&scope=parts");
    expect(workshopCategoryHref("ready")).toContain("scope=ready");
  });
  it("keeps unknown costs and aging null rather than coercing them into zero", () => {
    const parsed = workshopBusinessReportSchema.parse(reportFixture);
    expect(parsed.totals.directCost).toBeNull();
    expect(parsed.totals.debt).toBeNull();
    expect(() => workshopBusinessReportSchema.parse({ ...reportFixture, totals: { ...reportFixture.totals, collected: "520" } })).toThrow();
  });
});
