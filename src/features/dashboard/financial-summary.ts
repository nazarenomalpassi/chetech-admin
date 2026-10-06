import { getTvBoardSaleStatus } from "@/features/tv-boards/sales";
import { formatCashMethod, normalizeCashMethodValue, type CashMethod } from "@/lib/cash";

export type DashboardCashSummaryRow = {
  medio_pago: string;
  total_income: number | string;
  total_outcome: number | string;
  period_sales: number | string;
  period_repairs: number | string;
  period_expenses: number | string;
  period_invoices: number | string;
};

export type DashboardCashSummary = {
  method: CashMethod;
  totalIncome: number;
  totalOutcome: number;
  periodSales: number;
  periodRepairs: number;
  periodExpenses: number;
  periodInvoices: number;
};

export function normalizeDashboardCashSummaryRows(rows: DashboardCashSummaryRow[]) {
  const summary = new Map<CashMethod, DashboardCashSummary>();

  for (const row of rows) {
    const method = normalizeCashMethodValue(row.medio_pago);
    if (!method) continue;
    const current = summary.get(method) ?? {
      method,
      totalIncome: 0,
      totalOutcome: 0,
      periodSales: 0,
      periodRepairs: 0,
      periodExpenses: 0,
      periodInvoices: 0
    };

    summary.set(method, {
      method,
      totalIncome: current.totalIncome + Number(row.total_income),
      totalOutcome: current.totalOutcome + Number(row.total_outcome),
      periodSales: current.periodSales + Number(row.period_sales),
      periodRepairs: current.periodRepairs + Number(row.period_repairs),
      periodExpenses: current.periodExpenses + Number(row.period_expenses),
      periodInvoices: current.periodInvoices + Number(row.period_invoices)
    });
  }

  return summary;
}

export function getDashboardAccountLabel(method: string) {
  return formatCashMethod(method);
}

export function getPendingTvBoardsReleaseAmount(
  boards: Array<{
    soldAt: string | null;
    releaseDate: string | null;
    releasedAt?: string | null;
    netAmount: number | null;
  }>,
  today: string
) {
  return boards.reduce((acc, board) => {
    const saleStatus = getTvBoardSaleStatus(
      {
        soldAt: board.soldAt,
        releaseDate: board.releaseDate,
        releasedAt: board.releasedAt
      },
      today
    );

    if (saleStatus !== "pending_release") {
      return acc;
    }

    return acc + Number(board.netAmount ?? 0);
  }, 0);
}
