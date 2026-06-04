import { describe, expect, it } from "vitest";

import { getDashboardRange } from "@/features/dashboard/range";

describe("getDashboardRange", () => {
  it("arma un rango inclusivo por fecha", () => {
    const range = getDashboardRange("2026-04-20", "2026-04-22");

    expect(range.from).toBe("2026-04-20");
    expect(range.to).toBe("2026-04-22");
    expect(range.startIso).toContain("2026-04-20");
    expect(range.endIso).toContain("2026-04-23");
  });

  it("normaliza fechas invertidas", () => {
    const range = getDashboardRange("2026-04-25", "2026-04-21");

    expect(range.from).toBe("2026-04-21");
    expect(range.to).toBe("2026-04-25");
  });
});
