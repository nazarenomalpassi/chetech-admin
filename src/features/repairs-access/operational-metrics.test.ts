import { describe, expect, it } from "vitest";
import {
  getOperationalMetricsRange,
  getOperationalAgeBucket,
  getRecordedMedianDays,
  getComparableWarrantyRate,
  isComparableWarrantyInterval,
  workshopOperationalMetricsSchema
} from "./operational-metrics";

describe("operational metrics reference formulas", () => {
  it("defaults to the current month in Argentina, not the UTC month", () => {
    expect(getOperationalMetricsRange({}, new Date("2026-12-01T01:30:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
  it("keeps a valid explicit range and fills only missing bounds", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(getOperationalMetricsRange({ from: "2026-10-01" }, now)).toEqual({ from: "2026-10-01", to: "2026-11-10" });
    expect(getOperationalMetricsRange({ from: "2024-02-29", to: "2024-03-01" }, now)).toEqual({ from: "2024-02-29", to: "2024-03-01" });
  });
  it.each([
    { from: "2026-02-30" }, { to: "2026-02-29" }, { from: "2026-1-01" },
    { from: "" }, { from: "2026-11-11", to: "2026-11-10" },
    { from: "2000-01-01", to: "2026-11-10" }
  ])("rejects impossible, inverted or unbounded expensive ranges: %j", (range) => {
    expect(() => getOperationalMetricsRange(range, new Date("2026-11-10T12:00:00Z"))).toThrow(/periodo/i);
  });
  it.each([[0, "days0to7"], [7, "days0to7"], [8, "days8to14"], [14, "days8to14"], [15, "days15to30"], [30, "days15to30"], [31, "days31plus"], [400, "days31plus"], [null, null], [-1, null], [1.5, null], [NaN, null]] as const)("buckets %s days without pretending unknown dates are recent", (days, expected) => {
    expect(getOperationalAgeBucket(days)).toBe(expected);
  });
  it("computes a median from observed nonnegative intervals, retaining genuine zero", () => {
    expect(getRecordedMedianDays([100, 0, 2, 4, null, -3, Infinity])).toBe(3);
    expect(getRecordedMedianDays([3, 1, 2])).toBe(2);
    expect(getRecordedMedianDays([])).toBeNull();
    expect(getRecordedMedianDays([null, -1, NaN])).toBeNull();
  });
  it("does not invent a warranty denominator or a zero rate without verified observation", () => {
    expect(getComparableWarrantyRate({ returnedOrders: 2, comparableOrders: null })).toBeNull();
    expect(getComparableWarrantyRate({ returnedOrders: 0, comparableOrders: 0 })).toBeNull();
    expect(getComparableWarrantyRate({ returnedOrders: 3, comparableOrders: 20 })).toBe(15);
    expect(getComparableWarrantyRate({ returnedOrders: 0, comparableOrders: 20 })).toBe(0);
    expect(getComparableWarrantyRate({ returnedOrders: 21, comparableOrders: 20 })).toBeNull();
  });
  it("rejects absent snapshots instead of defaulting every counter to zero", () => {
    expect(workshopOperationalMetricsSchema.safeParse({}).success).toBe(false);
    expect(workshopOperationalMetricsSchema.safeParse(null).success).toBe(false);
  });
  it("requires complete prospective warranty observation, expiry and real date bounds", () => {
    const interval = { startsOn: "2026-11-10", endsOn: "2026-12-10", observationFrom: "2026-11-10", asOf: "2026-12-11" };
    expect(isComparableWarrantyInterval(interval)).toBe(true);
    expect(isComparableWarrantyInterval({ ...interval, observationFrom: null })).toBe(false);
    expect(isComparableWarrantyInterval({ ...interval, startsOn: "2026-11-09" })).toBe(false);
    expect(isComparableWarrantyInterval({ ...interval, asOf: "2026-12-10" })).toBe(false);
    expect(isComparableWarrantyInterval({ ...interval, endsOn: "2026-11-09" })).toBe(false);
    expect(isComparableWarrantyInterval({ ...interval, startsOn: "2026-02-30" })).toBe(false);
  });
});
