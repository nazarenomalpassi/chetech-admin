import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyStableCreationOrder } from "@/lib/chronology";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";
import { mapRepairsHistoryRows } from "@/features/repairs/history-mapper";

export async function getRepairs(page = 1) {
  const supabase = await createServerSupabaseClient();
  const { from, to } = getPaginationRange(page);

  const historyQuery = (supabase as any)
    .from("repairs")
    .select(
      "id, repair_access_order_id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, status, observations, entry_date, created_at, updated_at, repair_access_orders(repair_number), repair_payments(method, amount, created_at)",
      { count: "exact" }
    );
  let { data, error, count } = await applyStableCreationOrder(historyQuery)
    .range(from, to);

  if (error?.message?.includes("repair_access_order_id") || error?.message?.includes("repair_access_orders")) {
    const fallbackQuery = (supabase as any)
      .from("repairs")
      .select("id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, status, observations, entry_date, created_at, updated_at, repair_payments(method, amount, created_at)", { count: "exact" });
    const fallback = await applyStableCreationOrder(fallbackQuery)
      .range(from, to);

    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error?.message?.includes("customer_phone") || error?.message?.includes("order_number")) {
    const fallbackQuery = (supabase as any)
      .from("repairs")
      .select("id, customer_name, device, issue_description, final_price, estimated_price, status, entry_date, created_at, updated_at, repair_payments(method, amount, created_at)", { count: "exact" });
    const fallback = await applyStableCreationOrder(fallbackQuery)
      .range(from, to);

    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) {
    throw new Error(error.message);
  }

  const items = mapRepairsHistoryRows(data ?? []);

  return {
    items,
    pagination: createPaginationMeta(count ?? items.length, page, DEFAULT_PAGE_SIZE)
  };
}
