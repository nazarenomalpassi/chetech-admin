import { describe, expect, it } from "vitest";

import { calculateVariation, getMonthlyComparisonPeriods } from "@/features/reports/comparison";

describe("getMonthlyComparisonPeriods", () => {
  it("devuelve mes actual y mes anterior en base a una fecha de referencia", () => {
    const periods = getMonthlyComparisonPeriods("2026-04-23");

    expect(periods.current.monthKey).toBe("2026-04");
    expect(periods.previous.monthKey).toBe("2026-03");
    expect(periods.current.startIso).toContain("2026-04-01");
    expect(periods.current.endIso).toContain("2026-05-01");
  });
});

describe("calculateVariation", () => {
  it("calcula diferencia y porcentaje", () => {
    const variation = calculateVariation(150, 100);

    expect(variation.difference).toBe(50);
    expect(variation.percentage).toBe(50);
    expect(variation.trend).toBe("up");
  });

  it("evita porcentajes invalidos cuando el periodo anterior es cero", () => {
    const variation = calculateVariation(100, 0);

    expect(variation.difference).toBe(100);
    expect(variation.percentage).toBeNull();
  });
});
