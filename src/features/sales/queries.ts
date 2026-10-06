import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyStableCreationOrder } from "@/lib/chronology";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";
import { mapSalesHistoryRows } from "@/features/sales/history-mapper";

export async function getSalesHistory(page = 1) {
  const supabase = await createServerSupabaseClient();
  const { from, to } = getPaginationRange(page);
  const historyQuery = (supabase as any)
    .from("sales")
    .select(
      `
        id,
        sale_number,
        subtotal,
        cost_total,
        profit_total,
        sold_at,
        notes,
        created_at,
        updated_at,
        sale_payments(method, amount),
        sale_items(product_id, quantity, unit_price, total, products(name, sku))
      `,
      { count: "exact" }
    );
  const { data, error, count } = await applyStableCreationOrder(historyQuery)
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const items = mapSalesHistoryRows(data ?? []);

  return {
    items,
    pagination: createPaginationMeta(count ?? items.length, page, DEFAULT_PAGE_SIZE)
  };
}

export async function getSaleProductOptions() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("products")
    .select("id, sku, name, stock, cost, sale_price, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((product: any) => ({
    id: product.id,
    label: `${product.sku} - ${product.name}`,
    stock: Number(product.stock),
    cost: Number(product.cost),
    salePrice: Number(product.sale_price)
  }));
}
