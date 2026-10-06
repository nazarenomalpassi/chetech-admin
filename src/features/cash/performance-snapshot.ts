import { normalizeCashMethodValue } from "@/lib/cash";

export type CashSummarySnapshotRow = {
  medio_pago: string;
  total_income: number;
  total_outcome: number;
  period_sales: number;
  period_repairs: number;
  period_expenses: number;
  period_invoices: number;
  period_salaries: number;
  period_income: number;
  period_outcome: number;
};

export function normalizeCashPerformanceSnapshot(payload: any) {
  const cashSummary = Array.isArray(payload?.cash_summary)
    ? (payload.cash_summary.map((row: any) => {
        const periodSales = Number(row.period_sales ?? 0);
        const periodRepairs = Number(row.period_repairs ?? 0);
        const periodExpenses = Number(row.period_expenses ?? 0);
        const periodInvoices = Number(row.period_invoices ?? 0);
        const periodSalaries = Number(row.period_salaries ?? 0);

        return {
          medio_pago: row.medio_pago,
          total_income: Number(row.total_income ?? 0),
          total_outcome: Number(row.total_outcome ?? 0),
          period_sales: periodSales,
          period_repairs: periodRepairs,
          period_expenses: periodExpenses,
          period_invoices: periodInvoices,
          period_salaries: periodSalaries,
          period_income: Number(row.period_income ?? periodSales + periodRepairs + periodInvoices),
          period_outcome: Number(row.period_outcome ?? periodExpenses + periodSalaries)
        };
      }) as CashSummarySnapshotRow[])
    : [];

  const recentMovements = Array.isArray(payload?.recent_movements)
    ? payload.recent_movements.map((movement: any) => ({
        id: movement.id,
        type: movement.tipo,
        amount: Number(movement.monto),
        method: normalizeCashMethodValue(movement.medio_pago) ?? movement.medio_pago,
        description: movement.descripcion ?? "",
        referenceTable: movement.referencia_tabla ?? "",
        date: movement.fecha
      }))
    : [];

  const closures = Array.isArray(payload?.closures)
    ? payload.closures.map((closure: any) => ({
        id: closure.id,
        date: closure.fecha,
        openingBalance: Number(closure.saldo_inicial),
        income: Number(closure.ingresos),
        outcome: Number(closure.egresos),
        finalBalance: Number(closure.saldo_final),
        observations: closure.observaciones ?? ""
      }))
    : [];

  return { cashSummary, recentMovements, closures };
}
