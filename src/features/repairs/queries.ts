import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCashMethodValue } from "@/lib/cash";

type RawRepairPayment = {
  method: string | null;
  created_at?: string | null;
};

function getLatestPaymentMethod(payments: RawRepairPayment[] | null | undefined) {
  if (!Array.isArray(payments) || !payments.length) return "";

  const [latestPayment] = [...payments].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return latestPayment?.method ?? "";
}

export async function getRepairs() {
  const supabase = await createServerSupabaseClient();

  let { data, error } = await (supabase as any)
    .from("repairs")
    .select(
      "id, repair_access_order_id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, status, observations, created_at, repair_access_orders(repair_number)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error?.message?.includes("repair_access_order_id") || error?.message?.includes("repair_access_orders")) {
    const fallback = await (supabase as any)
      .from("repairs")
      .select("id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, status, observations, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    data = fallback.data;
    error = fallback.error;
  }

  if (error?.message?.includes("customer_phone") || error?.message?.includes("order_number")) {
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
        .select("repair_id, method, amount, created_at")
        .in("repair_id", repairIds)
    : { data: [], error: null };

  if (paymentsError && paymentsError.code !== "42P01") {
    throw new Error(paymentsError.message);
  }

  const paymentsByRepair = new Map<string, { method: string; amount: number; created_at?: string | null }[]>();
  for (const payment of payments ?? []) {
    const current = paymentsByRepair.get(payment.repair_id) ?? [];
    current.push({
      method: normalizeCashMethodValue(payment.method) ?? payment.method ?? "",
      amount: Number(payment.amount),
      created_at: payment.created_at
    });
    paymentsByRepair.set(payment.repair_id, current);
  }

  const latestMethodByRepair = new Map<string, string>();
  for (const [repairId, repairPayments] of paymentsByRepair.entries()) {
    latestMethodByRepair.set(repairId, getLatestPaymentMethod(repairPayments));
  }

  return (data ?? []).map((repair: any) => ({
    id: repair.id,
    repairAccessOrderId: repair.repair_access_order_id ?? null,
    repairAccessOrderNumber: Array.isArray(repair.repair_access_orders)
      ? repair.repair_access_orders[0]?.repair_number ?? ""
      : repair.repair_access_orders?.repair_number ?? "",
    customerName: repair.customer_name,
    customerPhone: repair.customer_phone ?? "",
    device: repair.device,
    orderNumber: repair.order_number ?? null,
    issueDescription: repair.issue_description ?? "",
    finalPrice: Number(repair.final_price ?? 0),
    estimatedPrice: Number(repair.estimated_price ?? 0),
    status: repair.status,
    observations: repair.observations ?? null,
    createdAt: repair.created_at,
    paymentMethod: latestMethodByRepair.get(repair.id) ?? "",
    payments: paymentsByRepair.get(repair.id) ?? []
  }));
}
