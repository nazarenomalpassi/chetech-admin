"use client";

import { useId, type CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export type BusinessChartRow = {
  label: string;
  value: number | null;
  previous?: number | null;
  tone: "income" | "expense" | "service" | "pending" | "neutral" | "margin";
};

const colors = {
  "--chart-income": "#11795a",
  "--chart-expense": "#c14141",
  "--chart-service": "#0369a1",
  "--chart-pending": "#88600f",
  "--chart-neutral": "#475569",
  "--chart-margin": "#11795a",
  "--chart-previous": "#64748b"
} as CSSProperties;
const compactMoney = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const money = (value: number | null | undefined) => value == null ? "Por determinar" : formatCurrency(value);

export function BusinessChart({ title, description, rows, valueLabel = "Importe", previousLabel }: {
  title: string;
  description: string;
  rows: BusinessChartRow[];
  valueLabel?: string;
  previousLabel?: string;
}) {
  const id = useId();
  const hasValues = rows.some((row) => (row.value !== null && row.value !== 0) || (previousLabel && row.previous != null && row.previous !== 0));
  const chartRows = rows.slice(0, 8);

  return (
    <Card className="min-w-0" style={colors}>
      <figure aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <figcaption>
          <h3 className="text-lg font-semibold text-slate-950" id={`${id}-title`}>{title}</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-slate-600" id={`${id}-description`}>{description}</p>
        </figcaption>
        {hasValues ? <>
          {previousLabel && <p className="mt-3 text-xs text-slate-600">Barras de color: {valueLabel}. Barras grises: {previousLabel}.</p>}
          <div className="mt-3 min-w-0" style={{ height: Math.max(200, chartRows.length * (previousLabel ? 56 : 44) + 40) }}>
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
          </div>
          {rows.length > 8 && <p className="text-xs text-slate-600">Grafico: primeras 8 filas. La tabla contiene todos los registros.</p>}
        </> : <p role="status" className="my-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{rows.length === 0 ? "No hay registros para este grafico." : rows.every((row) => row.value === null && row.previous == null) ? "Los importes estan por determinar. Consulta el alcance de los datos." : "Sin importes distintos de cero para graficar. Consulta los valores y pendientes en la tabla."}</p>}
        <details className="mt-3 border-t border-slate-200">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600">Ver tabla de datos</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Datos de {title}</caption>
              <thead><tr className="border-b border-slate-200 text-slate-600"><th scope="col" className="py-2 pr-3 font-medium">Concepto</th><th scope="col" className="px-2 py-2 text-right font-medium">{valueLabel}</th>{previousLabel && <th scope="col" className="py-2 pl-2 text-right font-medium">{previousLabel}</th>}</tr></thead>
              <tbody>{rows.map((row) => <tr className="border-b border-slate-100" key={row.label}><th scope="row" className="py-2 pr-3 font-medium text-slate-700">{row.label}</th><td className="px-2 py-2 text-right tabular-nums text-slate-950">{money(row.value)}</td>{previousLabel && <td className="py-2 pl-2 text-right tabular-nums text-slate-600">{money(row.previous)}</td>}</tr>)}</tbody>
            </table>
          </div>
        </details>
      </figure>
    </Card>
  );
}
