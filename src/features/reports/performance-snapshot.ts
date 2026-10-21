export type ReportPeriodMetrics = {
  salesTotal: number;
  salesProfit: number;
  repairsTotal: number;
  expensesTotal: number;
  invoicesTotal: number;
  salariesTotal: number;
  netCash: number;
  salesUnknownCostCount?: number | null;
};

export type RankingRow = {
  label: string;
  quantity: number;
  revenue: number;
  profit: number | null;
  unknownCostCount?: number | null;
};

type SummaryRow = {
  userId: string | null;
  label: string;
  total: number;
  count: number;
};

function readNumber(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || !Number.isFinite(Number(value))) {
    throw new Error("Reporte incompleto: falta un importe o conteo valido. Intenta consultar nuevamente.");
  }
  return Number(value);
}

function normalizeMetrics(value: any): ReportPeriodMetrics {
  return {
    salesTotal: readNumber(value?.sales_total),
    salesProfit: readNumber(value?.sales_profit),
    repairsTotal: readNumber(value?.repairs_total),
    expensesTotal: readNumber(value?.expenses_total),
    invoicesTotal: readNumber(value?.invoices_total),
    salariesTotal: readNumber(value?.salaries_total),
    netCash: readNumber(value?.net_cash),
    ...(value?.sales_unknown_cost_count != null ? { salesUnknownCostCount: readNumber(value.sales_unknown_cost_count) } : {})
  };
}

function normalizeRankings(value: unknown): RankingRow[] {
  if (!Array.isArray(value)) throw new Error("Reporte incompleto: no se recibio el ranking.");

  return value.map((row: any) => ({
    label: row?.label === "Producto sin nombre" ? "Conceptos sin producto de inventario (sin detalle)" : String(row?.label ?? "Concepto sin descripcion"),
    quantity: readNumber(row?.quantity),
    revenue: readNumber(row?.revenue),
    profit: row?.profit == null ? null : readNumber(row.profit),
    ...(row?.unknown_cost_count != null ? { unknownCostCount: readNumber(row.unknown_cost_count) } : {})
  }));
}

function normalizeSummary(value: unknown): SummaryRow[] {
  if (!Array.isArray(value)) throw new Error("Reporte incompleto: no se recibio el resumen por responsable.");

  return value.map((row: any) => ({
    userId: row?.user_id ?? null,
    label: String(row?.label ?? "Sin asignar"),
    total: readNumber(row?.total),
    count: readNumber(row?.count)
  }));
}

export function normalizeReportsPerformanceSnapshot(payload: any) {
  return {
    metrics: {
      selected: normalizeMetrics(payload?.metrics?.selected),
      current: normalizeMetrics(payload?.metrics?.current),
      previous: normalizeMetrics(payload?.metrics?.previous)
    },
    rankings: {
      products: normalizeRankings(payload?.rankings?.products),
      categories: normalizeRankings(payload?.rankings?.categories)
    },
    sellerSummary: normalizeSummary(payload?.seller_summary),
    technicianSummary: normalizeSummary(payload?.technician_summary)
  };
}
