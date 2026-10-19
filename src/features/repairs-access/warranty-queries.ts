import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WarrantyReturnRecord } from "./warranty-return";

export type WarrantyReturnsPage = { items: WarrantyReturnRecord[]; total: number; activeCount: number; page: number; pageSize: number };
async function read(args: Record<string, unknown>): Promise<WarrantyReturnsPage> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("workshop_warranty_read", args);
  if (error) throw new Error("No se pudieron consultar los reingresos por garantia. Reintenta en unos instantes.");
  return data as WarrantyReturnsPage;
}
export async function getWarrantyReturnsPage(params: { page?: string; search?: string; closed?: boolean } = {}) {
  const n = Number(params.page);
  return read({ p_page: Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1, p_search: (params.search ?? "").trim().slice(0, 200), p_closed: Boolean(params.closed), p_page_size: 30 });
}
export async function getWarrantyReturnsCount() {
  return (await read({ p_page_size: 1 })).activeCount;
}
export async function getOrderWarrantyReturns(orderIds: string[]) {
  if (!orderIds.length) return [];
  return (await read({ p_order_ids: orderIds })).items;
}
