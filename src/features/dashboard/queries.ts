import { getCashSettings } from "@/lib/app-settings";
import { calculateBalanceTransferDeltas } from "@/features/balance-transfers/model";
import { getBalanceTransfers } from "@/features/balance-transfers/queries";
import { CASH_METHODS, normalizeCashMethodValue } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPendingTvBoardsReleaseAmount } from "@/features/dashboard/financial-summary";
import { getDashboardRange } from "@/features/dashboard/range";
import { getDashboardInstallmentsData } from "@/features/installments/queries";
import { getLocalDateInputValue } from "@/lib/utils";

export async function getDashboardData({
  dateFrom,
  dateTo
}: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const cashSettings = await getCashSettings();
  const range = getDashboardRange(dateFrom, dateTo);

  const todayDate = getLocalDateInputValue();
  const [
    lowStockProductsRaw,
    topProducts,
    invoicesInRange,
    cashMovements,
    tvBoardSales,
    installmentsDashboard,
    balanceTransfers
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, stock, min_stock")
      .order("stock", { ascending: true })
      .limit(24),
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
    (supabase as any)
      .from("movimientos_caja")
      .select("tipo, monto, medio_pago, fecha")
      .gte("fecha", cashSettings.movementCutoff),
    (supabase as any)
      .from("tv_boards")
      .select("sold_at, release_date, mercado_libre_net_amount")
      .not("sold_at", "is", null),
    getDashboardInstallmentsData(supabase as any, todayDate),
    getBalanceTransfers(supabase as any)
  ]);

  const lowStockProducts = ((lowStockProductsRaw.data ?? []) as any[]).filter(
    (product) => Number(product.stock) <= Number(product.min_stock)
  );

  const allMovements = cashMovements.error ? [] : ((cashMovements.data ?? []) as any[]);
  const transferDeltas = calculateBalanceTransferDeltas(
    balanceTransfers.map((transfer) => ({
      amount: transfer.amount,
      fromPaymentMethod: transfer.fromPaymentMethod,
      isVoided: transfer.isVoided,
      toPaymentMethod: transfer.toPaymentMethod
    }))
  );
  const rangeMovements = allMovements.filter((row) => row.fecha >= range.startIso && row.fecha < range.endIso);
  const pendingReleaseAmount = tvBoardSales.error
    ? 0
    : getPendingTvBoardsReleaseAmount(
        ((tvBoardSales.data ?? []) as any[]).map((board) => ({
          soldAt: board.sold_at,
          releaseDate: board.release_date,
          netAmount: board.mercado_libre_net_amount === null ? null : Number(board.mercado_libre_net_amount)
        })),
        todayDate
      );

  const accountBalances = CASH_METHODS.map((method) => {
    const methodMovements = allMovements.filter((row) => normalizeCashMethodValue(row.medio_pago) === method);
    const income = methodMovements
      .filter((row) => ["venta", "reparacion", "facturacion"].includes(row.tipo))
      .reduce((acc, row) => acc + Number(row.monto), 0);
    const outcome = methodMovements
      .filter((row) => ["gasto", "sueldo"].includes(row.tipo))
      .reduce((acc, row) => acc + Number(row.monto), 0);

    return {
      method,
      openingBalance: cashSettings.openingBalances[method],
      balance: cashSettings.openingBalances[method] + income - outcome + transferDeltas[method]
    };
  });

  const salesTodayTotal = rangeMovements
    .filter((row) => row.tipo === "venta")
    .reduce((acc, row) => acc + Number(row.monto), 0);
  const expensesTodayTotal = rangeMovements
    .filter((row) => row.tipo === "gasto")
    .reduce((acc, row) => acc + Number(row.monto), 0);
  const repairsTodayTotal = rangeMovements
    .filter((row) => row.tipo === "reparacion")
    .reduce((acc, row) => acc + Number(row.monto), 0);
  const invoiceIncomeToday = ((invoicesInRange.data ?? []) as any[]).reduce(
    (acc, row) => acc + Number(row.total),
    0
  );
  const movementIncome = rangeMovements
    .filter((row) => ["venta", "reparacion", "facturacion"].includes(row.tipo))
    .reduce((acc, row) => acc + Number(row.monto), 0);
  const movementOutcome = rangeMovements
    .filter((row) => ["gasto"].includes(row.tipo))
    .reduce((acc, row) => acc + Number(row.monto), 0);
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
    range
  };
}
