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
  const { data, error } = await (supabase as any)
    .from("categories")
    .select("id, name")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((category: any) => ({
    id: category.id,
    name: category.name,
    skuPrefix: null
  }));
});
