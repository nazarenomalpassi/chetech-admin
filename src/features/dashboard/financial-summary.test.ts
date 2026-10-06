import { describe, expect, it } from "vitest";

import {
  getDashboardAccountLabel,
  getPendingTvBoardsReleaseAmount,
  normalizeDashboardCashSummaryRows
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

  it("excluye del pendiente las placas liberadas manualmente", () => {
    expect(getPendingTvBoardsReleaseAmount([
      { soldAt: "2026-05-10T14:20:00.000Z", releaseDate: "2026-05-20", releasedAt: "2026-05-11T14:20:00.000Z", netAmount: 98000 },
      { soldAt: "2026-05-10T14:20:00.000Z", releaseDate: "2026-05-20", releasedAt: null, netAmount: 50000 }
    ], "2026-05-12")).toBe(50000);
  });
});

describe("normalizeDashboardCashSummaryRows", () => {
  it("consolida MP y NX Local sin mezclarlos con NX Santi", () => {
    const summary = normalizeDashboardCashSummaryRows([
      {
        medio_pago: "mp",
        total_income: "1000",
        total_outcome: "100",
        period_sales: "400",
        period_repairs: "0",
        period_expenses: "50",
        period_invoices: "0"
      },
      {
        medio_pago: "NX Local",
        total_income: "500",
        total_outcome: "0",
        period_sales: "0",
        period_repairs: "500",
        period_expenses: "0",
        period_invoices: "0"
      },
      {
        medio_pago: "nx",
        total_income: "300",
        total_outcome: "20",
        period_sales: "300",
        period_repairs: "0",
        period_expenses: "20",
        period_invoices: "0"
      }
    ]);

    expect(summary.get("mp")).toMatchObject({ totalIncome: 1500, totalOutcome: 100, periodRepairs: 500 });
    expect(summary.get("nx")).toMatchObject({ totalIncome: 300, totalOutcome: 20, periodSales: 300 });
  });
});
