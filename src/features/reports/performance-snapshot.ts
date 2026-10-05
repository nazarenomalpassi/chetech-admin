export type ReportPeriodMetrics = {
  salesTotal: number;
  salesProfit: number;
  repairsTotal: number;
  expensesTotal: number;
  invoicesTotal: number;
  salariesTotal: number;
  netCash: number;
};

type RankingRow = {
  label: string;
  quantity: number;
  revenue: number;
  profit: number;
};

type SummaryRow = {
  userId: string | null;
  label: string;
  total: number;
  count: number;
};

const EMPTY_METRICS: ReportPeriodMetrics = {
  salesTotal: 0,
  salesProfit: 0,
  repairsTotal: 0,
  expensesTotal: 0,
  invoicesTotal: 0,
  salariesTotal: 0,
  netCash: 0
};

function normalizeMetrics(value: any): ReportPeriodMetrics {
  return {
    salesTotal: Number(value?.sales_total ?? 0),
    salesProfit: Number(value?.sales_profit ?? 0),
    repairsTotal: Number(value?.repairs_total ?? 0),
    expensesTotal: Number(value?.expenses_total ?? 0),
    invoicesTotal: Number(value?.invoices_total ?? 0),
    salariesTotal: Number(value?.salaries_total ?? 0),
    netCash: Number(value?.net_cash ?? 0)
  };
}

function normalizeRankings(value: unknown): RankingRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row: any) => ({
    label: String(row?.label ?? "Sin nombre"),
    quantity: Number(row?.quantity ?? 0),
    revenue: Number(row?.revenue ?? 0),
    profit: Number(row?.profit ?? 0)
  }));
}

function normalizeSummary(value: unknown): SummaryRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row: any) => ({
    userId: row?.user_id ?? null,
    label: String(row?.label ?? "Sin asignar"),
    total: Number(row?.total ?? 0),
    count: Number(row?.count ?? 0)
  }));
}

export function normalizeReportsPerformanceSnapshot(payload: any) {
  return {
    metrics: {
      selected: payload ? normalizeMetrics(payload.metrics?.selected) : { ...EMPTY_METRICS },
      current: payload ? normalizeMetrics(payload.metrics?.current) : { ...EMPTY_METRICS },
      previous: payload ? normalizeMetrics(payload.metrics?.previous) : { ...EMPTY_METRICS }
    },
    rankings: {
      products: normalizeRankings(payload?.rankings?.products),
      categories: normalizeRankings(payload?.rankings?.categories)
    },
    sellerSummary: normalizeSummary(payload?.seller_summary),
    technicianSummary: normalizeSummary(payload?.technician_summary)
  };
}
