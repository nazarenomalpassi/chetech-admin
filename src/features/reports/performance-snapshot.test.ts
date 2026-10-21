import { describe, expect, it } from "vitest";

import { normalizeReportsPerformanceSnapshot } from "@/features/reports/performance-snapshot";
const emptyMetrics = { sales_total: 0, sales_profit: 0, repairs_total: 0, expenses_total: 0, invoices_total: 0, salaries_total: 0, net_cash: 0 };

describe("normalizeReportsPerformanceSnapshot", () => {
  it("normaliza numericos de Postgres y mantiene rankings y responsables", () => {
    const snapshot = normalizeReportsPerformanceSnapshot({
      metrics: {
        selected: {
          sales_total: "100",
          sales_profit: "40",
          repairs_total: "80",
          expenses_total: "20",
          invoices_total: "180",
          salaries_total: "10",
          net_cash: "150"
        },
        current: emptyMetrics,
        previous: emptyMetrics
      },
      rankings: {
        products: [{ label: "Cable", quantity: "2", revenue: "100", profit: "40" }],
        categories: [{ label: "Cables", quantity: "2", revenue: "100", profit: "40" }]
      },
      seller_summary: [{ user_id: "user-1", label: "Santi", total: "100", count: "1" }],
      technician_summary: [{ user_id: null, label: "Sin asignar", total: "80", count: "2" }]
    });

    expect(snapshot.metrics.selected).toEqual({
      salesTotal: 100,
      salesProfit: 40,
      repairsTotal: 80,
      expensesTotal: 20,
      invoicesTotal: 180,
      salariesTotal: 10,
      netCash: 150
    });
    expect(snapshot.rankings.products[0]).toEqual({
      label: "Cable",
      quantity: 2,
      revenue: 100,
      profit: 40
    });
    expect(snapshot.sellerSummary[0]).toEqual({
      userId: "user-1",
      label: "Santi",
      total: 100,
      count: 1
    });
  });

  it("devuelve ceros y listas vacias ante agregados sin registros", () => {
    const snapshot = normalizeReportsPerformanceSnapshot({ metrics: { selected: emptyMetrics, current: emptyMetrics, previous: emptyMetrics }, rankings: { products: [], categories: [] }, seller_summary: [], technician_summary: [] });

    expect(snapshot.metrics.selected.salesTotal).toBe(0);
    expect(snapshot.rankings.products).toEqual([]);
    expect(snapshot.technicianSummary).toEqual([]);
  });

  it.each([null, {}, { metrics: { selected: { ...emptyMetrics, sales_total: null }, current: emptyMetrics, previous: emptyMetrics } }])("does not turn unavailable aggregates into valid zero activity", (payload) => {
    expect(() => normalizeReportsPerformanceSnapshot(payload)).toThrow(/incompleto/);
  });

  it("normalizes optional coverage while preserving unknown margins and non-inventory labels", () => {
    const snapshot = normalizeReportsPerformanceSnapshot({
      metrics: { selected: { ...emptyMetrics, sales_unknown_cost_count: "2" }, current: emptyMetrics, previous: emptyMetrics },
      rankings: { products: [{ label: "Producto sin nombre", quantity: "1", revenue: "200", profit: null, unknown_cost_count: "1" }], categories: [] },
      seller_summary: [], technician_summary: []
    });
    expect(snapshot.metrics.selected.salesUnknownCostCount).toBe(2);
    expect(snapshot.rankings.products[0]).toMatchObject({ label: "Conceptos sin producto de inventario (sin detalle)", profit: null, unknownCostCount: 1 });
  });
});
