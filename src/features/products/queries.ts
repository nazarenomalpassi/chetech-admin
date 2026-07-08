import { cache } from "react";

import { matchesSearchText } from "@/lib/search";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getProducts(filters?: {
  search?: string;
  category?: string;
  status?: "all" | "active" | "inactive";
}) {
  const supabase = await createServerSupabaseClient();
  let query = (supabase as any)
    .from("products")
    .select("id, sku, name, cost, sale_price, stock, min_stock, is_active, notes, category_id, categories(name)")
    .order("name");

  if (filters?.category) {
    query = query.eq("category_id", filters.category);
  }

  if (filters?.status === "active") {
    query = query.eq("is_active", true);
  }

  if (filters?.status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((product: any) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      cost: Number(product.cost),
      salePrice: Number(product.sale_price),
      stock: Number(product.stock),
      minStock: Number(product.min_stock),
      isActive: product.is_active,
      notes: product.notes,
      categoryId: product.category_id,
      category: Array.isArray(product.categories)
        ? product.categories[0]?.name ?? null
        : product.categories?.name ?? null
    }))
    .filter((product: any) => matchesSearchText(`${product.name} ${product.sku ?? ""}`, filters?.search));
}

export const getProductCategories = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, { data: productRefs, error: productRefsError }] = await Promise.all([
    (supabase as any)
      .from("categories")
      .select("id, name, sku_prefix")
      .order("name"),
    (supabase as any).from("products").select("category_id")
  ]);

  if (error) {
    throw new Error(error.message);
  }

  if (productRefsError) {
    throw new Error(productRefsError.message);
  }

  const countsByCategory = (productRefs ?? []).reduce((acc: Record<string, number>, product: any) => {
    if (!product.category_id) return acc;
    acc[product.category_id] = (acc[product.category_id] ?? 0) + 1;
    return acc;
  }, {});

  return (data ?? []).map((category: any) => ({
    id: category.id,
    name: category.name,
    skuPrefix: category.sku_prefix ?? null,
    productCount: countsByCategory[category.id] ?? 0
  }));
});
