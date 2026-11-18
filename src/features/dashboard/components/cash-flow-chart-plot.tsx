"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DailyCashPoint } from "@/features/dashboard/daily-cash";
import { formatCurrency } from "@/lib/utils";

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

export const cashFlowColors = {
  income: "var(--color-primary)",
  outcome: "var(--color-danger)"
};

export function CashFlowChartPlot({ points }: { points: DailyCashPoint[] }) {
  const tickEvery = Math.max(1, Math.ceil(points.length / 10));

  return (
    <ResponsiveContainer height={240} width="100%">
      <BarChart
        barCategoryGap="28%"
        barGap={2}
        data={points}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval={tickEvery - 1}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          tickFormatter={(value: number) => compact.format(value)}
          tickLine={false}
          width={56}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as DailyCashPoint | undefined;
            if (!point) return null;
            return (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-pop">
                <p className="font-medium text-foreground">{label}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 tabular-nums">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: cashFlowColors.income }}
                    />
                    Ingresos
                  </dt>
                  <dd className="text-right text-foreground">{formatCurrency(point.income)}</dd>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: cashFlowColors.outcome }}
                    />
                    Egresos
                  </dt>
                  <dd className="text-right text-foreground">{formatCurrency(point.outcome)}</dd>
                  <dt className="text-muted-foreground">Resultado</dt>
                  <dd className="text-right font-medium text-foreground">
                    {formatCurrency(point.income - point.outcome)}
                  </dd>
                </dl>
              </div>
            );
          }}
          cursor={{ fill: "var(--color-muted)" }}
        />
        <Bar
          dataKey="income"
          fill={cashFlowColors.income}
          isAnimationActive={false}
          name="Ingresos"
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="outcome"
          fill={cashFlowColors.outcome}
          isAnimationActive={false}
          name="Egresos"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
