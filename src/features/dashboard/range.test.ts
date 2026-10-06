import { describe, expect, it } from "vitest";

import { getDashboardRange } from "@/features/dashboard/range";

describe("getDashboardRange", () => {
  it("usa desde el primer dia del mes hasta hoy cuando no recibe filtros", () => {
    const range = getDashboardRange(undefined, undefined, new Date("2026-08-28T15:00:00.000Z"));

    expect(range.from).toBe("2026-08-01");
    expect(range.to).toBe("2026-08-28");
    expect(range.today).toBe("2026-08-28");
    expect(range.isToday).toBe(false);
    expect(range.isMonthToDate).toBe(true);
  });

  it("mantiene un unico dia en el primer dia del mes", () => {
    const range = getDashboardRange(undefined, undefined, new Date("2026-09-01T15:00:00.000Z"));

    expect(range.from).toBe("2026-09-01");
    expect(range.to).toBe("2026-09-01");
    expect(range.isToday).toBe(true);
    expect(range.isMonthToDate).toBe(true);
  });

  it("arma un rango inclusivo por fecha", () => {
    const range = getDashboardRange("2026-04-20", "2026-04-22", new Date("2026-04-25T15:00:00.000Z"));

    expect(range.from).toBe("2026-04-20");
    expect(range.to).toBe("2026-04-22");
    expect(range.startIso).toContain("2026-04-20");
    expect(range.endIso).toContain("2026-04-23");
  });

  it("normaliza fechas invertidas", () => {
    const range = getDashboardRange("2026-04-25", "2026-04-21", new Date("2026-04-25T15:00:00.000Z"));

    expect(range.from).toBe("2026-04-21");
    expect(range.to).toBe("2026-04-25");
  });
});
