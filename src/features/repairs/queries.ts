import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyStableCreationOrder } from "@/lib/chronology";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";
import { mapRepairsHistoryRows } from "@/features/repairs/history-mapper";
import { mapPrimaryOrderOption } from "@/features/invoices/primary-order-mapper";

const financialRepairColumns = "id, repair_access_order_id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, financial_version, status, observations, entry_date, created_at, updated_at, repair_access_orders(repair_number, repair_access_payments(id, method, amount, payment_date, created_at, legacy_repair_payment_id, voided_at)), repair_payments(id, method, amount, payment_date, created_at)";
export type RepairCollectionOrder = {
  id: string; repairNumber: string; intakeDate: string; customerName: string; customerPhone: string; device: string;
  issueDescription: string; amount: number; paymentMethod: string; observations: string;
};
export type RepairCollectionTarget = { order: RepairCollectionOrder | null; repair: ReturnType<typeof mapRepairsHistoryRows>[number] | null; error: string | null };

export function normalizeRepairCollectionNumber(value: string) {
  if (value.length > 64) return null;
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  const digits = decoded.trim().toUpperCase().match(/^(?:REP[\s-]*)?(\d{1,12})$/)?.[1];
  return digits ? `REP-${digits.padStart(6, "0")}` : null;
}

export async function getRepairFinancialRecordByNativeId(orderId: string, supabase: any) {
  const result = await supabase.from("repairs").select(financialRepairColumns).eq("repair_access_order_id", orderId).limit(2);
  if (result.error) throw new Error("No se pudo verificar el registro financiero vinculado. Recarga antes de crear un registro.");
  if (result.data?.length > 1) throw new Error("Hay mas de un registro financiero vinculado a esta REP. Revisa los registros existentes antes de cobrar.");
  return mapRepairsHistoryRows(result.data ?? [])[0] ?? null;
}

async function getRepairCollectionTarget(repairNumber: string, supabase: any): Promise<RepairCollectionTarget> {
  const number = normalizeRepairCollectionNumber(repairNumber);
  if (!number) return { order: null, repair: null, error: "El enlace necesita un numero REP valido." };
  const result = await supabase.from("repair_access_orders")
    .select("id,repair_number,intake_date,final_amount,approved_amount,budget_amount,budget_detail,issue_reported,payment_method,repair_access_customers(full_name,phone),repair_access_devices(device_type,brand,model)")
    .eq("repair_number", number).maybeSingle();
  if (result.error || !result.data) return { order: null, repair: null, error: "No se pudo encontrar la REP indicada. Revisa el numero antes de cobrar." };
  try {
    const raw = result.data;
    const option = mapPrimaryOrderOption(raw);
    const relatedDevice = Array.isArray(raw.repair_access_devices) ? raw.repair_access_devices[0] : raw.repair_access_devices;
    const order: RepairCollectionOrder = {
      id: option.id, repairNumber: option.repairNumber, intakeDate: raw.intake_date, customerName: option.customerName, customerPhone: option.customerPhone,
      device: [relatedDevice?.device_type, relatedDevice?.brand, relatedDevice?.model].filter(Boolean).join(" - "),
      issueDescription: raw.budget_detail || raw.issue_reported || "", amount: option.amount, paymentMethod: raw.payment_method || "efectivo", observations: ""
    };
    return { order, repair: await getRepairFinancialRecordByNativeId(raw.id, supabase), error: null };
  } catch (error) { return { order: null, repair: null, error: error instanceof Error ? error.message : "Revisa el registro financiero vinculado." }; }
}

export async function getRepairs(page = 1, repairNumber?: string) {
  const supabase = await createServerSupabaseClient();
  const { from, to } = getPaginationRange(page);

  const historyQuery = (supabase as any)
    .from("repairs")
    .select(
      financialRepairColumns,
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
    collectionTarget: repairNumber === undefined ? null : await getRepairCollectionTarget(repairNumber, supabase),
    pagination: createPaginationMeta(count ?? items.length, page, DEFAULT_PAGE_SIZE)
  };
}
