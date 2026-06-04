import { describe, expect, it } from "vitest";

import {
  getDashboardAccountLabel,
  getPendingTvBoardsReleaseAmount
} from "@/features/dashboard/financial-summary";

describe("getDashboardAccountLabel", () => {
  it("muestra NX SANTI para la cuenta nx en dashboard", () => {
    expect(getDashboardAccountLabel("nx")).toBe("NX SANTI");
  });

  it("muestra NX LOCAL para la cuenta mp operativa en dashboard", () => {
    expect(getDashboardAccountLabel("mp")).toBe("NX LOCAL");
  });
});

describe("getPendingTvBoardsReleaseAmount", () => {
  it("suma solo el dinero de placas pendientes de liberacion", () => {
    const total = getPendingTvBoardsReleaseAmount(
      [
        {
          soldAt: "2026-05-10T14:20:00.000Z",
          releaseDate: "2026-05-14",
          netAmount: 98000
        },
        {
          soldAt: "2026-05-08T10:00:00.000Z",
          releaseDate: "2026-05-11",
          netAmount: 75000
        },
        {
          soldAt: null,
          releaseDate: null,
          netAmount: null
        }
      ],
      "2026-05-12"
    );

    expect(total).toBe(98000);
  });
});
