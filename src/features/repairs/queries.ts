import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getRepairs() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repairs")
    .select("id, customer_name, device, issue_description, final_price, estimated_price, status, observations, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((repair: any) => ({
    id: repair.id,
    customerName: repair.customer_name,
    device: repair.device,
    issueDescription: repair.issue_description,
    finalPrice: Number(repair.final_price ?? 0),
    estimatedPrice: Number(repair.estimated_price ?? 0),
    status: repair.status,
    observations: repair.observations,
    createdAt: repair.created_at
  }));
}
