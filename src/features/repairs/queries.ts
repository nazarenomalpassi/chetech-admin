import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCashMethodValue } from "@/lib/cash";

export async function getRepairs() {
  const supabase = await createServerSupabaseClient();

  let { data, error } = await (supabase as any)
    .from("repairs")
    .select("id, customer_name, device, order_number, final_price, estimated_price, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error?.message?.includes("order_number")) {
    const fallback = await (supabase as any)
      .from("repairs")
      .select("id, customer_name, device, issue_description, final_price, estimated_price, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const repairIds = (data ?? []).map((repair: any) => repair.id);
  const { data: payments, error: paymentsError } = repairIds.length
    ? await (supabase as any)
        .from("repair_payments")
        .select("repair_id, method, amount")
        .in("repair_id", repairIds)
    : { data: [], error: null };

  if (paymentsError && paymentsError.code !== "42P01") {
    throw new Error(paymentsError.message);
  }

  const paymentsByRepair = new Map<string, { method: string; amount: number }[]>();
  for (const payment of payments ?? []) {
    const current = paymentsByRepair.get(payment.repair_id) ?? [];
    current.push({
      method: normalizeCashMethodValue(payment.method) ?? payment.method,
      amount: Number(payment.amount)
    });
    paymentsByRepair.set(payment.repair_id, current);
  }

  return (data ?? []).map((repair: any) => ({
    id: repair.id,
    customerName: repair.customer_name,
    device: repair.device,
    orderNumber: repair.order_number ?? null,
    finalPrice: Number(repair.final_price ?? 0),
    estimatedPrice: Number(repair.estimated_price ?? 0),
    status: repair.status,
    createdAt: repair.created_at,
    payments: paymentsByRepair.get(repair.id) ?? []
  }));
}
