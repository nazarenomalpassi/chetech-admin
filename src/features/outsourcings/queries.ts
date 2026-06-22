import { createServerSupabaseClient } from "@/lib/supabase/server";

type RawOutsourcing = {
  id: string;
  repair_access_order_id: string;
  workshop_name: string;
  sent_at: string;
  retrieved_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
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

export async function getRepairOutsourcingDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repair_outsourcings")
    .select(
      `
        id,
        repair_access_order_id,
        workshop_name,
        sent_at,
        retrieved_at,
        status,
        notes,
        created_at,
        repair_access_orders (
          id,
          repair_number,
          intake_date,
          issue_reported,
          status,
          repair_access_customers (
            full_name,
            phone,
            dni,
            address
          ),
          repair_access_devices (
            device_type,
            brand,
            model,
            serial_number,
            accessory_details
          )
        )
      `
    )
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const records: RepairOutsourcingRecord[] = (data ?? []).map((record: RawOutsourcing) => mapOutsourcing(record));
  const today = new Date().toISOString().slice(0, 10);

  return {
    records,
    summary: {
      total: records.length,
      active: records.filter((record) => record.status === "en_taller").length,
      retrieved: records.filter((record) => record.status === "retirado").length,
      sentToday: records.filter((record) => record.sentAt === today).length,
      workshops: new Set(records.map((record) => record.workshopName.trim().toLowerCase()).filter(Boolean)).size
    } satisfies RepairOutsourcingSummary
  };
}
