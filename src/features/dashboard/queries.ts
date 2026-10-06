import { getCashSettings } from "@/lib/app-settings";
import { calculateBalanceTransferDeltas } from "@/features/balance-transfers/model";
import { getBalanceTransfers } from "@/features/balance-transfers/queries";
import { CASH_METHODS, normalizeCashMethodValue } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getPendingTvBoardsReleaseAmount,
  normalizeDashboardCashSummaryRows,
  type DashboardCashSummaryRow
} from "@/features/dashboard/financial-summary";
import { getDashboardRange } from "@/features/dashboard/range";
import { getDashboardInstallmentsData } from "@/features/installments/queries";
import { getVisitsTodayDashboardSummary } from "@/features/visits/queries";
import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";
import { getLocalDateInputValue } from "@/lib/utils";
import { readRecordPages } from "@/lib/read-record-pages";

async function getDashboardCashSummary(
  supabase: any,
  range: ReturnType<typeof getDashboardRange>,
  cashSettingsPromise: ReturnType<typeof getCashSettings>
) {
  const aggregateResult = await supabase.rpc("get_dashboard_cash_summary", {
    p_cutoff: null,
    p_start: range.startIso,
    p_end: range.endIso
  });

  if (!aggregateResult.error) {
    return (aggregateResult.data ?? []) as DashboardCashSummaryRow[];
  }

  if (!isMissingDatabaseFunctionError(aggregateResult.error, "get_dashboard_cash_summary")) {
    throw new Error(aggregateResult.error.message);
  }

  // Compatibility path while the aggregate RPC migration reaches production.
  const cashSettings = await cashSettingsPromise;
  const legacyResult = await supabase
    .from("movimientos_caja")
    .select("tipo, monto, medio_pago, fecha")
    .gte("fecha", cashSettings.movementCutoff);

  if (legacyResult.error) throw new Error(legacyResult.error.message);

  const summary = new Map<string, DashboardCashSummaryRow>();
  for (const movement of legacyResult.data ?? []) {
    const method = normalizeCashMethodValue(movement.medio_pago);
    if (!method) continue;

    const row = summary.get(method) ?? {
      medio_pago: method,
      total_income: 0,
      total_outcome: 0,
      period_sales: 0,
      period_repairs: 0,
      period_expenses: 0,
      period_invoices: 0
    };
    const amount = Number(movement.monto);
    const isInRange = movement.fecha >= range.startIso && movement.fecha < range.endIso;

    if (["venta", "reparacion", "facturacion"].includes(movement.tipo)) row.total_income = Number(row.total_income) + amount;
    if (["gasto", "sueldo"].includes(movement.tipo)) row.total_outcome = Number(row.total_outcome) + amount;
    if (isInRange && movement.tipo === "venta") row.period_sales = Number(row.period_sales) + amount;
    if (isInRange && movement.tipo === "reparacion") row.period_repairs = Number(row.period_repairs) + amount;
    if (isInRange && movement.tipo === "gasto") row.period_expenses = Number(row.period_expenses) + amount;
    if (isInRange && movement.tipo === "facturacion") row.period_invoices = Number(row.period_invoices) + amount;
    summary.set(method, row);
  }

  return Array.from(summary.values());
}

export async function getDashboardData({
  dateFrom,
  dateTo
}: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const cashSettingsPromise = getCashSettings();
  const range = getDashboardRange(dateFrom, dateTo);

  const todayDate = getLocalDateInputValue();
  const [
    lowStockProductsRaw,
    topProducts,
    invoicesInRange,
    cashSummaryRows,
    tvBoardSales,
    installmentsDashboard,
    balanceTransfers,
    visitsDashboard,
    cashSettings
  ] = await Promise.all([
    readRecordPages<{ id: string; name: string; stock: number; min_stock: number }>(
      (from, to) => supabase
        .from("products")
        .select("id, name, stock, min_stock")
        .order("stock", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
      500,
      (product) => product.id
    ).then((data) => ({ data, error: null })).catch(() => {
      throw new Error("No se pudieron cargar los datos de productos. Intenta nuevamente.");
    }),
    (supabase as any).rpc("get_top_products", {
      date_from: range.startIso,
      date_to: range.endIso
    }),
    (supabase as any)
      .from("invoices")
      .select("total, created_at")
      .neq("status", "anulado")
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso),
    getDashboardCashSummary(supabase as any, range, cashSettingsPromise),
    (supabase as any)
      .from("tv_boards")
      .select("sold_at, release_date, released_at, mercado_libre_net_amount")
      .not("sold_at", "is", null),
    getDashboardInstallmentsData(supabase as any, todayDate),
    getBalanceTransfers(supabase as any),
    getVisitsTodayDashboardSummary(),
    cashSettingsPromise
  ]);

  for (const [label, result] of [
    ["productos", lowStockProductsRaw],
    ["productos mas vendidos", topProducts],
    ["facturacion", invoicesInRange],
    ["liberaciones de MercadoLibre", tvBoardSales]
  ] as const) {
    if (result.error) {
      throw new Error(`No se pudieron cargar los datos de ${label}. Intenta nuevamente.`);
    }
  }

  const lowStockProducts = ((lowStockProductsRaw.data ?? []) as any[]).filter(
    (product) => Number(product.stock) <= Number(product.min_stock)
  );

  const normalizedCashSummary = normalizeDashboardCashSummaryRows(cashSummaryRows);
  const transferDeltas = calculateBalanceTransferDeltas(
    balanceTransfers.map((transfer) => ({
      amount: transfer.amount,
      fromPaymentMethod: transfer.fromPaymentMethod,
      isVoided: transfer.isVoided,
      toPaymentMethod: transfer.toPaymentMethod
    }))
  );
  const pendingReleaseAmount = getPendingTvBoardsReleaseAmount(
        ((tvBoardSales.data ?? []) as any[]).map((board) => ({
          soldAt: board.sold_at,
          releaseDate: board.release_date,
          releasedAt: board.released_at,
          netAmount: board.mercado_libre_net_amount === null ? null : Number(board.mercado_libre_net_amount)
        })),
        todayDate
      );

  const accountBalances = CASH_METHODS.map((method) => {
    const summary = normalizedCashSummary.get(method);
    const income = summary?.totalIncome ?? 0;
    const outcome = summary?.totalOutcome ?? 0;

    return {
      method,
      openingBalance: cashSettings.openingBalances[method],
      balance: cashSettings.openingBalances[method] + income - outcome + transferDeltas[method]
    };
  });

  const cashSummaryValues = Array.from(normalizedCashSummary.values());
  const salesTodayTotal = cashSummaryValues.reduce((acc, row) => acc + row.periodSales, 0);
  const expensesTodayTotal = cashSummaryValues.reduce((acc, row) => acc + row.periodExpenses, 0);
  const repairsTodayTotal = cashSummaryValues.reduce((acc, row) => acc + row.periodRepairs, 0);
  const invoiceIncomeToday = ((invoicesInRange.data ?? []) as any[]).reduce(
    (acc, row) => acc + Number(row.total),
    0
  );
  const movementIncome = cashSummaryValues.reduce(
    (acc, row) => acc + row.periodSales + row.periodRepairs + row.periodInvoices,
    0
  );
  const movementOutcome = expensesTodayTotal;
  const realProfitToday = movementIncome - movementOutcome;

  return {
    salesTodayTotal,
    expensesTodayTotal,
    repairsTodayTotal,
    lowStockProducts,
    accountBalances,
    pendingMercadoPagoReleaseAmount: pendingReleaseAmount,
    topProducts: topProducts.data ?? [],
    invoiceIncomeToday,
    realProfitToday,
    installmentsDashboard,
    visitsDashboard,
    range
  };
}
