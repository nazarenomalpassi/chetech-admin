import { cache } from "react";

import { matchesSearchText } from "@/lib/search";
import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createPaginationMeta, getPaginationRange } from "@/lib/pagination";
import { readRecordPages } from "@/lib/read-record-pages";
import { buildProductSearchFilter, parseProductListState, type ProductListParams } from "./list-state";
import { getProductAvailability } from "./availability";

export async function getProductPage(filters: ProductListParams & { includeCosts?: boolean } = {}) {
  const state = parseProductListState(filters);
  const supabase = await createServerSupabaseClient();
  const searchFilter = buildProductSearchFilter(state.search);
  const column = state.sort === "price" ? "sale_price" : state.sort;
  function buildQuery(page: number, head = false) {
    const options = head ? { count: "exact", head: true } : { count: "exact" };
    let query = filters.includeCosts
      ? (supabase as any).from("products").select("id, sku, name, cost, sale_price, stock, min_stock, is_active, notes, category_id, categories(name)", options)
      : (supabase as any).rpc("get_technician_product_catalog", { p_search: null, p_category: state.category || null, p_status: state.status }, options);
    if (filters.includeCosts) {
      if (state.category) query = query.eq("category_id", state.category);
      if (state.status !== "all") query = query.eq("is_active", state.status === "active");
    }
    if (searchFilter) query = query.or(searchFilter);
    if (head) return query;
    const range = getPaginationRange(page, state.pageSize);
    return query.order(column, { ascending: true }).order("id", { ascending: true }).range(range.from, range.to);
  }
  let result = await buildQuery(state.page);
  if (result.error?.code === "PGRST103") {
    const counted = await buildQuery(1, true);
    result = { ...counted, data: [] };
  }
  if (result.error) throw new Error(result.error.message);
  if (!Number.isSafeInteger(result.count) || result.count < 0) throw new Error("Unavailable product count");
  const pagination = createPaginationMeta(result.count, state.page, state.pageSize);
  if (pagination.page !== state.page) {
    result = await buildQuery(pagination.page);
    if (result.error) throw new Error(result.error.message);
  }
  const availability = await getProductAvailability(supabase as any, (result.data ?? []).map((product: any) => product.id));
  return {
    products: (result.data ?? []).map((product: any) => ({
      id: product.id, sku: product.sku, name: product.name,
      cost: filters.includeCosts ? Number(product.cost ?? 0) : 0,
      salePrice: Number(product.sale_price), stock: Number(product.stock), minStock: Number(product.min_stock),
      isActive: product.is_active, notes: product.notes, categoryId: product.category_id,
      reservedStock: availability.values.get(product.id)?.reserved ?? null,
      availableStock: availability.values.get(product.id)?.available ?? null,
      category: product.category_name ?? (Array.isArray(product.categories) ? product.categories[0]?.name ?? null : product.categories?.name ?? null)
    })),
    pagination,
    availabilityStatus: availability.status,
    filters: { ...state, page: pagination.page }
  };
}

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

  // Category options do not need product counts. Never load inventory for this fallback.
  const data = await readRecordPages<any>((from, to) => (supabase as any).from("categories")
    .select("id, name, sku_prefix").order("name").order("id").range(from, to));

  return (data ?? []).map((category: any) => ({
    id: category.id,
    name: category.name,
    skuPrefix: category.sku_prefix ?? null,
    productCount: null
  }));
});
