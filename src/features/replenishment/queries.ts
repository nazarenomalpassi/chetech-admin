import { formatSalaryMonth, normalizeSalaryMonth } from "@/features/salaries/queries";
import type { ReplenishmentData, ReplenishmentStatus } from "@/features/replenishment/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function getReplenishmentData(requestedMonth?: string, search?: string): Promise<ReplenishmentData> {
  const monthKey = normalizeSalaryMonth(requestedMonth);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("get_replenishment_snapshot", {
    p_period_month: `${monthKey}-01`
  });

  if (error) {
    if (error.code === "42883" || error.code === "42P01" || error.message?.includes("schema cache")) {
      return {
        migrationReady: false,
        monthKey,
        monthLabel: formatSalaryMonth(monthKey),
        items: [],
        summary: { productCount: 0, quantitySold: 0, historicalCost: 0, suggestedReplacementCost: 0, orderTotal: 0 }
      };
    }
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, any>;
  const term = (search ?? "").trim().toLocaleLowerCase("es-AR");
  const items = (payload.items ?? []).map((item: any) => ({
    productId: String(item.product_id),
    productName: String(item.product_name),
    sku: String(item.sku ?? ""),
    quantitySold: numberValue(item.quantity_sold),
    stock: numberValue(item.stock),
    currentUnitCost: numberValue(item.current_unit_cost),
    currentSalePrice: numberValue(item.current_sale_price),
    revenue: numberValue(item.revenue),
    historicalCost: numberValue(item.historical_cost),
    currentReplacementCost: numberValue(item.current_replacement_cost),
    quantityToOrder: numberValue(item.quantity_to_order),
    status: String(item.status ?? "pending") as ReplenishmentStatus,
    notes: String(item.notes ?? ""),
    supplier: item.supplier ? String(item.supplier) : null
  })).filter((item: { productName: string; sku: string }) => !term || `${item.productName} ${item.sku}`.toLocaleLowerCase("es-AR").includes(term));

  const summary = payload.summary ?? {};
  return {
    migrationReady: true,
    monthKey,
    monthLabel: formatSalaryMonth(monthKey),
    items,
    summary: {
      productCount: numberValue(summary.product_count),
      quantitySold: numberValue(summary.quantity_sold),
      historicalCost: numberValue(summary.historical_cost),
      suggestedReplacementCost: numberValue(summary.suggested_replacement_cost),
      orderTotal: items.reduce((total: number, item: { quantityToOrder: number; currentUnitCost: number }) => total + item.quantityToOrder * item.currentUnitCost, 0)
    }
  };
}
