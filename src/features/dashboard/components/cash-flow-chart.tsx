"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { buildDailyCashSeries, type DailyCashRow } from "@/features/dashboard/daily-cash";
import { formatCurrency } from "@/lib/utils";

// Recharts pesa unos 100 kB: el gráfico se descarga después de pintar el inicio.
const CashFlowChartPlot = dynamic(
  () => import("./cash-flow-chart-plot").then((module) => module.CashFlowChartPlot),
  {
    ssr: false,
    loading: () => <div aria-hidden="true" className="h-60 animate-pulse rounded-lg bg-muted" />
  }
);

export function CashFlowChart({
  rows,
  from,
  to
}: {
  rows: DailyCashRow[];
  from: string;
  to: string;
}) {
  const { points, granularity } = useMemo(
    () => buildDailyCashSeries(rows, from, to),
    [rows, from, to]
  );
  const totals = useMemo(
    () =>
      points.reduce(
        (acc, point) => ({
          income: acc.income + point.income,
          outcome: acc.outcome + point.outcome
        }),
        { income: 0, outcome: 0 }
      ),
    [points]
  );
  const hasMovements = totals.income > 0 || totals.outcome > 0;
  const tableId = `caja-por-${granularity === "day" ? "dia" : "semana"}`;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Ingresos y egresos {granularity === "day" ? "por día" : "por semana"}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Movimientos de caja del período: ventas, cobros y comprobantes contra gastos y sueldos.
          </p>
        </div>
        <dl className="flex gap-5 text-sm tabular-nums">
          <div>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary" />
              Ingresos
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {formatCurrency(totals.income)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-danger" />
              Egresos
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {formatCurrency(totals.outcome)}
            </dd>
          </div>
        </dl>
      </div>

      {hasMovements ? (
        <div
          aria-describedby={tableId}
          className="mt-4"
          role="img"
          aria-label="Gráfico de ingresos y egresos"
        >
          <CashFlowChartPlot points={points} />
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">
          Sin movimientos de caja en este período.
        </p>
      )}

      <details className="mt-3">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-muted-foreground hover:text-foreground">
          Ver los datos
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm" id={tableId}>
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">
                  {granularity === "day" ? "Día" : "Semana"}
                </th>
                <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                <th className="px-3 py-2 text-right font-medium">Egresos</th>
                <th className="px-3 py-2 text-right font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points.map((point) => (
                <tr className="border-t border-border" key={point.key}>
                  <td className="px-3 py-1.5">{point.label}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(point.income)}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(point.outcome)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {formatCurrency(point.income - point.outcome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
