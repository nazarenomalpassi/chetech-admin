"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatCurrency } from "@/lib/utils";
import type { BusinessChartRow } from "./business-chart";

const compactMoney = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1
});
const money = (value: number | null | undefined) =>
  value == null ? "Por determinar" : formatCurrency(value);

export function BusinessChartPlot({
  title,
  rows: chartRows,
  valueLabel,
  previousLabel
}: {
  title: string;
  rows: BusinessChartRow[];
  valueLabel: string;
  previousLabel?: string;
}) {
  return (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={80}>
              <BarChart accessibilityLayer aria-label={title} data={chartRows} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 4 }} barGap={3}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value: number) => `$${compactMoney.format(value)}`} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="label" type="category" width={112} tickFormatter={(label: string) => label.length > 18 ? `${label.slice(0, 17)}...` : label} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(value: number) => money(value)} contentStyle={{ borderRadius: 10, borderColor: "#cbd5e1", color: "#0f172a" }} />
                <Bar dataKey="value" name={valueLabel} isAnimationActive={false} maxBarSize={22} radius={[0, 3, 3, 0]}>
                  {chartRows.map((row) => <Cell key={row.label} fill={`var(--chart-${row.value !== null && row.value < 0 && row.tone === "margin" ? "expense" : row.tone})`} />)}
                </Bar>
                {previousLabel && <Bar dataKey="previous" name={previousLabel} fill="var(--chart-previous)" isAnimationActive={false} maxBarSize={22} radius={[0, 3, 3, 0]} />}
              </BarChart>
            </ResponsiveContainer>
  );
}
