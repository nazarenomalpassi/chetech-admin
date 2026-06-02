import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getRepairs() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repairs")
    .select("id, repair_access_order_id, customer_name, customer_phone, device, issue_description, final_price, estimated_price, status, observations, created_at, repair_access_orders(repair_number)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((repair: any) => ({
    id: repair.id,
    repairAccessOrderId: repair.repair_access_order_id,
    repairAccessOrderNumber: Array.isArray(repair.repair_access_orders)
      ? repair.repair_access_orders[0]?.repair_number ?? ""
      : repair.repair_access_orders?.repair_number ?? "",
    customerName: repair.customer_name,
    customerPhone: repair.customer_phone ?? "",
    device: repair.device,
    issueDescription: repair.issue_description,
    finalPrice: Number(repair.final_price ?? 0),
    estimatedPrice: Number(repair.estimated_price ?? 0),
    status: repair.status,
    observations: repair.observations,
    createdAt: repair.created_at
  }));
}
