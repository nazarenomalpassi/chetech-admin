import { getDashboardRange } from "@/features/dashboard/range";
import { calculateVariation, getMonthlyComparisonPeriods } from "@/features/reports/comparison";
import { getBusinessGoals } from "@/lib/app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SummaryRow = {
  userId: string | null;
  label: string;
  total: number;
  count: number;
};

type PeriodMetrics = {
  salesTotal: number;
  salesProfit: number;
  repairsTotal: number;
  expensesTotal: number;
  invoicesTotal: number;
  salariesTotal: number;
  netCash: number;
};

function buildProfileMap(profiles: any[]) {
  return new Map<string, string>(
    profiles.map((profile) => [profile.id, profile.full_name || "Usuario sin nombre"])
  );
}

function sumAmount(rows: any[], field: string) {
  return rows.reduce((acc, row) => acc + Number(row[field] ?? 0), 0);
}

async function getPeriodMetrics(
  supabase: any,
  period: {
    startIso: string;
    endIso: string;
    dateStart: string;
    dateEndExclusive: string;
  }
): Promise<PeriodMetrics> {
  const [salesResult, repairsResult, expensesResult, invoicesResult, movementsResult, salariesResult] =
    await Promise.all([
      (supabase as any)
        .from("sales")
        .select("subtotal, profit_total")
        .gte("sold_at", period.startIso)
        .lt("sold_at", period.endIso),
      (supabase as any)
        .from("repairs")
        .select("final_price, estimated_price")
        .gte("created_at", period.startIso)
        .lt("created_at", period.endIso),
      (supabase as any)
        .from("expenses")
        .select("amount, is_voided")
        .gte("expense_date", period.dateStart)
        .lt("expense_date", period.dateEndExclusive),
      (supabase as any)
        .from("invoices")
        .select("total")
        .neq("status", "anulado")
        .gte("created_at", period.startIso)
        .lt("created_at", period.endIso),
      (supabase as any)
        .from("movimientos_caja")
        .select("tipo, monto")
        .gte("fecha", period.startIso)
        .lt("fecha", period.endIso),
      (supabase as any)
        .from("salary_withdrawals")
        .select("amount")
        .gte("withdrawal_date", period.dateStart)
        .lt("withdrawal_date", period.dateEndExclusive)
    ]);

  if (salesResult.error) throw new Error(salesResult.error.message);
  if (repairsResult.error) throw new Error(repairsResult.error.message);
  if (expensesResult.error) throw new Error(expensesResult.error.message);
  if (invoicesResult.error) throw new Error(invoicesResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);

  const salaries = salariesResult.error?.code === "42P01" ? [] : (salariesResult.data ?? []);
  if (salariesResult.error && salariesResult.error.code !== "42P01") {
    throw new Error(salariesResult.error.message);
  }

  const expenses = (expensesResult.data ?? []).filter((expense: any) => !expense.is_voided);
  const movements = movementsResult.data ?? [];
  const cashIncome = movements
    .filter((movement: any) => ["venta", "reparacion", "facturacion"].includes(movement.tipo))
    .reduce((acc: number, movement: any) => acc + Number(movement.monto), 0);
  const cashOutcome = movements
    .filter((movement: any) => ["gasto", "sueldo"].includes(movement.tipo))
    .reduce((acc: number, movement: any) => acc + Number(movement.monto), 0);

  return {
    salesTotal: sumAmount(salesResult.data ?? [], "subtotal"),
    salesProfit: sumAmount(salesResult.data ?? [], "profit_total"),
    repairsTotal: (repairsResult.data ?? []).reduce(
      (acc: number, repair: any) => acc + Number(repair.final_price ?? repair.estimated_price ?? 0),
      0
    ),
    expensesTotal: sumAmount(expenses, "amount"),
    invoicesTotal: sumAmount(invoicesResult.data ?? [], "total"),
    salariesTotal: sumAmount(salaries, "amount"),
    netCash: cashIncome - cashOutcome
  };
}

function buildGoalProgress(actual: number, target: number) {
  const progress = target > 0 ? Math.min((actual / target) * 100, 999) : 0;
  return {
    actual,
    target,
    difference: actual - target,
    progress
  };
}

export async function getReportsData(from?: string, to?: string) {
  const supabase = await createServerSupabaseClient();
  const range = getDashboardRange(from, to);
  const monthlyPeriods = getMonthlyComparisonPeriods(range.to);

  const [
    salesResult,
    repairsResult,
    saleItemsResult,
    currentMonthMetrics,
    previousMonthMetrics,
    businessGoals
  ] = await Promise.all([
    (supabase as any)
      .from("sales")
      .select("id, created_by, subtotal, profit_total, sold_at")
      .gte("sold_at", range.startIso)
      .lt("sold_at", range.endIso),
    (supabase as any)
      .from("repairs")
      .select("id, created_by, final_price, estimated_price, created_at")
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso),
    (supabase as any)
      .from("sale_items")
      .select("quantity, total, unit_cost, products(name, categories(name)), sales!inner(sold_at)")
      .gte("sales.sold_at", range.startIso)
      .lt("sales.sold_at", range.endIso),
    getPeriodMetrics(supabase, monthlyPeriods.current),
    getPeriodMetrics(supabase, monthlyPeriods.previous),
    getBusinessGoals()
  ]);

  if (salesResult.error) throw new Error(salesResult.error.message);
  if (repairsResult.error) throw new Error(repairsResult.error.message);
  if (saleItemsResult.error) throw new Error(saleItemsResult.error.message);

  const selectedRangeMetrics = await getPeriodMetrics(supabase, {
    startIso: range.startIso,
    endIso: range.endIso,
    dateStart: range.from,
    dateEndExclusive: range.endIso.slice(0, 10)
  });

  const profileIds = Array.from(
    new Set(
      [...(salesResult.data ?? []), ...(repairsResult.data ?? [])]
        .map((item: any) => item.created_by)
        .filter(Boolean)
    )
  );

  const { data: profiles, error: profilesError } = profileIds.length
    ? await (supabase as any).from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profileMap = buildProfileMap(profiles ?? []);

  const salesByUser = new Map<string, SummaryRow>();
  for (const sale of salesResult.data ?? []) {
    const userId = sale.created_by ?? "sin_asignar";
    const current = salesByUser.get(userId) ?? {
      userId: sale.created_by,
      label: sale.created_by ? profileMap.get(sale.created_by) ?? "Usuario" : "Sin asignar",
      total: 0,
      count: 0
    };
    current.total += Number(sale.subtotal ?? 0);
    current.count += 1;
    salesByUser.set(userId, current);
  }

  const repairsByUser = new Map<string, SummaryRow>();
  for (const repair of repairsResult.data ?? []) {
    const userId = repair.created_by ?? "sin_asignar";
    const current = repairsByUser.get(userId) ?? {
      userId: repair.created_by,
      label: repair.created_by ? profileMap.get(repair.created_by) ?? "Usuario" : "Sin asignar",
      total: 0,
      count: 0
    };
    current.total += Number(repair.final_price ?? repair.estimated_price ?? 0);
    current.count += 1;
    repairsByUser.set(userId, current);
  }

  const comparisonRows = [
    {
      key: "salesTotal",
      label: "Ventas",
      current: currentMonthMetrics.salesTotal,
      previous: previousMonthMetrics.salesTotal
    },
    {
      key: "salesProfit",
      label: "Ganancia de ventas",
      current: currentMonthMetrics.salesProfit,
      previous: previousMonthMetrics.salesProfit
    },
    {
      key: "repairsTotal",
      label: "Reparaciones",
      current: currentMonthMetrics.repairsTotal,
      previous: previousMonthMetrics.repairsTotal
    },
    {
      key: "expensesTotal",
      label: "Gastos",
      current: currentMonthMetrics.expensesTotal,
      previous: previousMonthMetrics.expensesTotal
    },
    {
      key: "invoicesTotal",
      label: "Facturacion",
      current: currentMonthMetrics.invoicesTotal,
      previous: previousMonthMetrics.invoicesTotal
    },
    {
      key: "netCash",
      label: "Resultado de caja",
      current: currentMonthMetrics.netCash,
      previous: previousMonthMetrics.netCash
    }
  ].map((item) => ({
    ...item,
    variation: calculateVariation(item.current, item.previous)
  }));

  const productMap = new Map<string, { label: string; quantity: number; revenue: number; profit: number }>();
  const categoryMap = new Map<string, { label: string; quantity: number; revenue: number; profit: number }>();

  for (const item of saleItemsResult.data ?? []) {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
    const productLabel = product?.name ?? "Producto sin nombre";
    const categoryLabel = category?.name ?? "Sin categoria";
    const quantity = Number(item.quantity ?? 0);
    const revenue = Number(item.total ?? 0);
    const profit = revenue - Number(item.unit_cost ?? 0) * quantity;

    const currentProduct = productMap.get(productLabel) ?? {
      label: productLabel,
      quantity: 0,
      revenue: 0,
      profit: 0
    };
    currentProduct.quantity += quantity;
    currentProduct.revenue += revenue;
    currentProduct.profit += profit;
    productMap.set(productLabel, currentProduct);

    const currentCategory = categoryMap.get(categoryLabel) ?? {
      label: categoryLabel,
      quantity: 0,
      revenue: 0,
      profit: 0
    };
    currentCategory.quantity += quantity;
    currentCategory.revenue += revenue;
    currentCategory.profit += profit;
    categoryMap.set(categoryLabel, currentCategory);
  }

  const currentMonthGoals = {
    sales: buildGoalProgress(currentMonthMetrics.salesTotal, businessGoals.salesTarget),
    profit: buildGoalProgress(currentMonthMetrics.salesProfit, businessGoals.profitTarget),
    repairs: buildGoalProgress(currentMonthMetrics.repairsTotal, businessGoals.repairsTarget),
    invoicing: buildGoalProgress(currentMonthMetrics.invoicesTotal, businessGoals.invoicingTarget)
  };

  return {
    range,
    metrics: selectedRangeMetrics,
    monthlyComparison: {
      currentLabel: monthlyPeriods.current.label,
      previousLabel: monthlyPeriods.previous.label,
      rows: comparisonRows
    },
    monthlyGoals: {
      label: monthlyPeriods.current.label,
      goals: currentMonthGoals
    },
    rankings: {
      products: Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
      categories: Array.from(categoryMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)
    },
    sellerSummary: Array.from(salesByUser.values()).sort((a, b) => b.total - a.total),
    technicianSummary: Array.from(repairsByUser.values()).sort((a, b) => b.total - a.total)
  };
}
