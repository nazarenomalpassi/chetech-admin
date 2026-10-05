import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getLocalDateInputValue } from "@/lib/utils";
import { getVisitDateRange } from "@/features/visits/model";
import { createPaginationMeta, parsePage } from "@/lib/pagination";

type RawOutsourcing = {
  id: string;
  repair_access_order_id: string;
  workshop_name: string;
  sent_at: string;
  retrieved_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  responsible_name: string | null;
  promised_at: string | null;
  expected_cost: number | null;
  actual_cost: number | null;
  quality_status: string;
  quality_notes: string | null;
  repair_access_orders: {
    id: string;
    repair_number: string | null;
    intake_date: string;
    issue_reported: string;
    status: string;
    repair_access_customers: {
      full_name: string;
      phone: string | null;
      dni: string | null;
      address: string | null;
    } | null;
    repair_access_devices: {
      device_type: string;
      brand: string | null;
      model: string | null;
      serial_number: string | null;
      accessory_details: string | null;
    } | null;
  } | null;
};

export type RepairOutsourcingRecord = {
  id: string;
  repairAccessOrderId: string;
  workshopName: string;
  sentAt: string;
  retrievedAt: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  responsibleName: string;
  promisedAt: string;
  expectedCost: number | null;
  actualCost: number | null;
  qualityStatus: string;
  qualityNotes: string;
  overdue: boolean;
  order: {
    id: string;
    repairNumber: string;
    intakeDate: string;
    issueReported: string;
    status: string;
    customerName: string;
    customerPhone: string;
    customerDni: string;
    customerAddress: string;
    deviceLabel: string;
    serialNumber: string;
    accessoryDetails: string;
  };
};

export type RepairOutsourcingSummary = {
  total: number;
  active: number;
  retrieved: number;
  sentToday: number;
  workshops: number;
  overdue: number;
  pendingQuality: number;
};

function mapOutsourcing(record: RawOutsourcing): RepairOutsourcingRecord {
  const order = record.repair_access_orders;
  const customer = order?.repair_access_customers;
  const device = order?.repair_access_devices;
  const deviceLabel = [device?.device_type, device?.brand, device?.model].filter(Boolean).join(" - ");

  return {
    id: record.id,
    repairAccessOrderId: record.repair_access_order_id,
    workshopName: record.workshop_name,
    sentAt: record.sent_at,
    retrievedAt: record.retrieved_at ?? "",
    status: record.status,
    notes: record.notes ?? "",
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    responsibleName: record.responsible_name ?? "",
    promisedAt: record.promised_at ?? "",
    expectedCost: record.expected_cost == null ? null : Number(record.expected_cost),
    actualCost: record.actual_cost == null ? null : Number(record.actual_cost),
    qualityStatus: record.quality_status ?? "pendiente",
    qualityNotes: record.quality_notes ?? "",
    overdue: record.status === "en_taller" && Boolean(record.promised_at && record.promised_at < getLocalDateInputValue()),
    order: {
      id: order?.id ?? record.repair_access_order_id,
      repairNumber: order?.repair_number ?? "Sin numero",
      intakeDate: order?.intake_date ?? "",
      issueReported: order?.issue_reported ?? "",
      status: order?.status ?? "",
      customerName: customer?.full_name ?? "Sin cliente",
      customerPhone: customer?.phone ?? "",
      customerDni: customer?.dni ?? "",
      customerAddress: customer?.address ?? "",
      deviceLabel: deviceLabel || "Equipo",
      serialNumber: device?.serial_number ?? "",
      accessoryDetails: device?.accessory_details ?? ""
    }
  };
}

export async function getRepairOutsourcingDashboard(filters: { page?: string; search?: string; status?: string; date?: string; view?: string } = {}) {
  const supabase = await createServerSupabaseClient();
  const today = getLocalDateInputValue();
  const status = ["todos", "en_taller", "retirado", "cancelado", "vencidas"].includes(filters.status ?? "") ? filters.status! : "en_taller";
  const view = ["day", "week"].includes(filters.view ?? "") ? filters.view! : "all";
  const range = filters.date || view !== "all" ? getVisitDateRange(filters.date || today, view) : null;
  const { data, error } = await (supabase as any)
    .rpc("get_operations_outsourcings_page", { p_search: filters.search?.trim() ?? "", p_status: status,
      p_from: range?.from ?? null, p_to: range?.to ?? null, p_page: Math.min(parsePage(filters.page), 2147483647) });

  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883" ? "Falta la migracion incremental de historial operativo." : error.message);

  const records: RepairOutsourcingRecord[] = (data?.records ?? []).map((record: RawOutsourcing) => mapOutsourcing(record));

  return {
    records,
    pagination: createPaginationMeta(Number(data?.total ?? 0), Number(data?.page ?? 1)),
    filters: { search: filters.search ?? "", status, date: filters.date ?? "", view },
    summary: data.summary as RepairOutsourcingSummary
  };
}
