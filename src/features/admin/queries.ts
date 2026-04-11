import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getAdminOverview() {
  const supabase = await createServerSupabaseClient();

  const [products, salesCount, expensesCount, repairsCount] = await Promise.all([
    (supabase as any)
      .from("products")
      .select("id, sku, name, stock, sale_price")
      .order("name")
      .limit(8),
    (supabase as any).from("sales").select("*", { count: "exact", head: true }),
    (supabase as any).from("expenses").select("*", { count: "exact", head: true }),
    (supabase as any).from("repairs").select("*", { count: "exact", head: true })
  ]);

  return {
    products: products.data ?? [],
    stats: {
      sales: salesCount.count ?? 0,
      expenses: expensesCount.count ?? 0,
      repairs: repairsCount.count ?? 0
    }
  };
}
