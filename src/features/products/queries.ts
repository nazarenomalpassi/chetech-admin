import { cache } from "react";

import { matchesSearchText } from "@/lib/search";
import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getProducts(filters?: {
  search?: string;
  category?: string;
  status?: "all" | "active" | "inactive";
  includeCosts?: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  if (!filters?.includeCosts) {
    const { data, error } = await (supabase as any).rpc("get_technician_product_catalog", {
      p_search: filters?.search?.trim() || null,
      p_category: filters?.category || null,
      p_status: filters?.status ?? "all"
    });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? [])
      .map((product: any) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        cost: 0,
        salePrice: Number(product.sale_price),
        stock: Number(product.stock),
        minStock: Number(product.min_stock),
        isActive: product.is_active,
        notes: product.notes,
        categoryId: product.category_id,
        category: product.category_name ?? null
      }))
      .filter((product: any) => matchesSearchText(`${product.name} ${product.sku ?? ""}`, filters?.search));
  }

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
      cost: Number(product.cost ?? 0),
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
  const aggregateResult = await (supabase as any).rpc("get_product_category_counts");

  if (!aggregateResult.error) {
    return (aggregateResult.data ?? []).map((category: any) => ({
      id: category.id,
      name: category.name,
      skuPrefix: category.sku_prefix ?? null,
      productCount: Number(category.product_count ?? 0)
    }));
  }

  if (!isMissingDatabaseFunctionError(aggregateResult.error, "get_product_category_counts")) {
    throw new Error(aggregateResult.error.message);
  }

  // Compatibility path while the aggregate RPC migration reaches production.
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
