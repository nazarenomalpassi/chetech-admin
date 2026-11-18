import { z } from "zod";

import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";

const money = z.coerce.number();

export const dailyCashRowSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  income: money,
  outcome: money,
  sales: money,
  repairs: money,
  invoices: money,
  expenses: money,
  salaries: money
});

export type DailyCashRow = z.infer<typeof dailyCashRowSchema>;

export type DailyCashPoint = {
  /** AAAA-MM-DD del día o del lunes de la semana. */
  key: string;
  label: string;
  income: number;
  outcome: number;
};

type RpcClient = {
  rpc(
    name: "get_dashboard_daily_cash",
    args: { p_start: string; p_end: string }
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

/** Devuelve null mientras la función no esté en la base; la pantalla oculta el gráfico. */
export async function getDailyCash(
  supabase: unknown,
  range: { startIso: string; endIso: string }
): Promise<DailyCashRow[] | null> {
  const { data, error } = await (supabase as RpcClient).rpc("get_dashboard_daily_cash", {
    p_start: range.startIso,
    p_end: range.endIso
  });
  if (error) {
    if (isMissingDatabaseFunctionError(error, "get_dashboard_daily_cash")) return null;
    throw new Error(error.message ?? "No se pudo leer la caja por día.");
  }
  const parsed = z.array(dailyCashRowSchema).safeParse(data ?? []);
  return parsed.success ? parsed.data : null;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function mondayOf(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = (value.getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

const dayLabel = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC"
});

function formatLabel(date: string) {
  return dayLabel.format(new Date(`${date}T00:00:00Z`)).replace(".", "");
}

/**
 * Serie continua para el gráfico: un punto por día (hasta 45 días) o por semana,
 * con ceros donde no hubo movimientos, para que el eje no salte fechas.
 */
export function buildDailyCashSeries(
  rows: DailyCashRow[],
  from: string,
  to: string
): { points: DailyCashPoint[]; granularity: "day" | "week" } {
  const spanDays =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const granularity: "day" | "week" = spanDays > 45 ? "week" : "day";
  const totals = new Map<string, { income: number; outcome: number }>();

  for (const row of rows) {
    const key = granularity === "day" ? row.day : mondayOf(row.day);
    const current = totals.get(key) ?? { income: 0, outcome: 0 };
    current.income += row.income;
    current.outcome += row.outcome;
    totals.set(key, current);
  }

  const points: DailyCashPoint[] = [];
  let cursor = granularity === "day" ? from : mondayOf(from);
  const step = granularity === "day" ? 1 : 7;
  while (cursor <= to) {
    const value = totals.get(cursor) ?? { income: 0, outcome: 0 };
    points.push({
      key: cursor,
      label: granularity === "day" ? formatLabel(cursor) : `Sem. ${formatLabel(cursor)}`,
      income: value.income,
      outcome: value.outcome
    });
    cursor = addDays(cursor, step);
    if (points.length > 120) break;
  }

  return { points, granularity };
}
