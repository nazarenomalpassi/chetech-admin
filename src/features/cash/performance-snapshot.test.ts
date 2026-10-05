import { describe, expect, it } from "vitest";

import { normalizeCashPerformanceSnapshot } from "@/features/cash/performance-snapshot";

describe("normalizeCashPerformanceSnapshot", () => {
  it("normaliza resumen, movimientos recientes y cierres", () => {
    const snapshot = normalizeCashPerformanceSnapshot({
      cash_summary: [
        {
          medio_pago: "efectivo",
          total_income: "150",
          total_outcome: "50",
          period_sales: "100",
          period_repairs: "50",
          period_expenses: "20",
          period_invoices: "0"
        }
      ],
      recent_movements: [
        {
          id: "movement-1",
          tipo: "venta",
          monto: "100",
          medio_pago: "efectivo",
          descripcion: null,
          referencia_tabla: "sales",
          fecha: "2026-08-28T10:00:00.000Z"
        }
      ],
      closures: [
        {
          id: "closure-1",
          fecha: "2026-08-28",
          saldo_inicial: "100",
          ingresos: "50",
          egresos: "20",
          saldo_final: "130",
          observaciones: null
        }
      ]
    });

    expect(snapshot.cashSummary[0].total_income).toBe(150);
    expect(snapshot.recentMovements[0]).toMatchObject({
      id: "movement-1",
      amount: 100,
      method: "efectivo",
      description: ""
    });
    expect(snapshot.closures[0].finalBalance).toBe(130);
  });
});
