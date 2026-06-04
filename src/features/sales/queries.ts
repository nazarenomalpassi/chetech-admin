import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCashMethodValue } from "@/lib/cash";

export async function getSalesHistory() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("sales")
    .select("id, sale_number, subtotal, cost_total, profit_total, sold_at, notes")
    .order("sold_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const saleIds = (data ?? []).map((sale: any) => sale.id);
  const [{ data: payments, error: paymentsError }, { data: items, error: itemsError }] = saleIds.length
    ? await Promise.all([
        (supabase as any).from("sale_payments").select("sale_id, method, amount").in("sale_id", saleIds),
        (supabase as any)
          .from("sale_items")
          .select("sale_id, product_id, quantity, unit_price, total, products(name, sku)")
          .in("sale_id", saleIds)
      ])
    : [
        { data: [], error: null },
        { data: [], error: null }
      ];

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  const paymentsBySale = new Map<string, { method: string; amount: number }[]>();
  for (const payment of payments ?? []) {
    const current = paymentsBySale.get(payment.sale_id) ?? [];
    current.push({
      method: normalizeCashMethodValue(payment.method) ?? payment.method,
      amount: Number(payment.amount)
    });
    paymentsBySale.set(payment.sale_id, current);
  }

  const itemsBySale = new Map<string, any[]>();
  for (const item of items ?? []) {
    const current = itemsBySale.get(item.sale_id) ?? [];
    current.push(item);
    itemsBySale.set(item.sale_id, current);
  }

  return (data ?? []).map((sale: any) => ({
    id: sale.id,
    saleNumber: sale.sale_number,
    subtotal: Number(sale.subtotal),
    costTotal: Number(sale.cost_total),
    profitTotal: Number(sale.profit_total),
    soldAt: sale.sold_at,
    notes: sale.notes ?? "",
    payments: paymentsBySale.get(sale.id) ?? [],
    items: (itemsBySale.get(sale.id) ?? []).map((item) => ({
      productId: item.product_id,
      productName: Array.isArray(item.products) ? item.products[0]?.name : item.products?.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      total: Number(item.total)
    }))
  }));
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
