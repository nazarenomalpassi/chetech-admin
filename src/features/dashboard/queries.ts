import { subDays } from "date-fns";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const CASH_METHODS = ["efectivo", "nx", "mp", "transferencia", "otro"] as const;

function normalizeCashMethod(method: string) {
  const normalized = (method || "otro").toLowerCase();
  if (normalized.includes("efectivo")) return "efectivo";
  if (normalized.includes("nx")) return "nx";
  if (normalized.includes("mp") || normalized.includes("mercado")) return "mp";
  if (normalized.includes("transfer")) return "transferencia";
  return "otro";
}

export async function getDashboardData({
  dateFrom,
  dateTo
}: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const from = dateFrom ?? subDays(now, 6).toISOString();
  const to = dateTo ?? now.toISOString();

  const [
    salesToday,
    expensesToday,
    repairsToday,
    lowStockProductsRaw,
    paymentBreakdown,
    topProducts,
    recentSales,
    saleCashRows,
    repairCashRows,
    expenseCashRows,
    invoiceCashRows,
    invoicePendingRows,
    invoicesToday
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("subtotal, profit_total")
      .gte("sold_at", startOfToday),
    supabase
      .from("expenses")
      .select("amount")
      .eq("is_voided", false)
      .gte("expense_date", startOfToday.slice(0, 10)),
    supabase
      .from("repair_payments")
      .select("amount")
      .gte("payment_date", startOfToday.slice(0, 10)),
    supabase
      .from("products")
      .select("id, name, stock, min_stock")
      .order("stock", { ascending: true })
      .limit(24),
    supabase
      .from("sale_payments")
      .select("method, amount")
      .gte("created_at", from)
      .lte("created_at", to),
    (supabase as any).rpc("get_top_products", { date_from: from, date_to: to }),
    supabase
      .from("sales")
      .select("sold_at, subtotal")
      .gte("sold_at", from)
      .lte("sold_at", to)
      .order("sold_at", { ascending: true }),
    (supabase as any)
      .from("sale_payments")
      .select("method, amount")
      .gte("created_at", from)
      .lte("created_at", to),
    (supabase as any)
      .from("repair_payments")
      .select("method, amount, payment_date")
      .gte("payment_date", from.slice(0, 10))
      .lte("payment_date", to.slice(0, 10)),
    (supabase as any)
      .from("expenses")
      .select("payment_method, amount, expense_date")
      .eq("is_voided", false)
      .gte("expense_date", from.slice(0, 10))
      .lte("expense_date", to.slice(0, 10)),
    (supabase as any)
      .from("invoice_payments")
      .select("method, amount, payment_date")
      .gte("payment_date", from.slice(0, 10))
      .lte("payment_date", to.slice(0, 10)),
    (supabase as any)
      .from("invoices")
      .select("balance")
      .neq("status", "anulado")
      .gt("balance", 0),
    (supabase as any)
      .from("invoice_payments")
      .select("amount, payment_date")
      .gte("payment_date", startOfToday.slice(0, 10))
  ]);

  const lowStockProducts = ((lowStockProductsRaw.data ?? []) as any[]).filter(
    (product) => Number(product.stock) <= Number(product.min_stock)
  );

  const paymentMap = new Map<string, number>();
  for (const item of (paymentBreakdown.data ?? []) as any[]) {
    const method = item.method || "sin_especificar";
    paymentMap.set(method, (paymentMap.get(method) ?? 0) + Number(item.amount));
  }

  const chartMap = new Map<string, number>();
  for (const sale of (recentSales.data ?? []) as any[]) {
    const key = sale.sold_at.slice(0, 10);
    chartMap.set(key, (chartMap.get(key) ?? 0) + Number(sale.subtotal));
  }

  const cashSummary = CASH_METHODS.map((method) => {
    const salesIncome = ((saleCashRows.data ?? []) as any[])
      .filter((row) => normalizeCashMethod(row.method) === method)
      .reduce((acc, row) => acc + Number(row.amount), 0);
    const repairsIncome = ((repairCashRows.data ?? []) as any[])
      .filter((row) => normalizeCashMethod(row.method) === method)
      .reduce((acc, row) => acc + Number(row.amount), 0);
    const invoicesIncome = ((invoiceCashRows.data ?? []) as any[])
      .filter((row) => normalizeCashMethod(row.method) === method)
      .reduce((acc, row) => acc + Number(row.amount), 0);
    const expensesOutcome = ((expenseCashRows.data ?? []) as any[])
      .filter((row) => normalizeCashMethod(row.payment_method) === method)
      .reduce((acc, row) => acc + Number(row.amount), 0);

    return {
      method,
      salesIncome,
      repairsIncome,
      invoicesIncome,
      expensesOutcome,
      balance: salesIncome + repairsIncome + invoicesIncome - expensesOutcome
    };
  });

  const invoiceIncomeToday = ((invoicesToday.data ?? []) as any[]).reduce(
    (acc, row) => acc + Number(row.amount),
    0
  );
  const invoicePendingBalance = ((invoicePendingRows.data ?? []) as any[]).reduce(
    (acc, row) => acc + Number(row.balance),
    0
  );

  return {
    salesToday: salesToday.data ?? [],
    expensesToday: expensesToday.data ?? [],
    repairsToday: repairsToday.data ?? [],
    lowStockProducts,
    paymentBreakdown: Array.from(paymentMap.entries()).map(([method, amount]) => ({ method, amount })),
    topProducts: topProducts.data ?? [],
    recentSales: Array.from(chartMap.entries()).map(([date, total]) => ({ date, total })),
    cashSummary,
    invoiceIncomeToday,
    invoicePendingBalance,
    invoicePendingCount: (invoicePendingRows.data ?? []).length
  };
}
