import { repairAccessStatusValues } from "@/features/repairs-access/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RawOrder = {
  id: string;
  intake_date: string;
  issue_reported: string;
  technical_diagnosis: string | null;
  budget_amount: number | null;
  approved_amount: number | null;
  final_amount: number | null;
  payment_method: string | null;
  payment_notes: string | null;
  is_paid: boolean;
  paid_at: string | null;
  delivered_at: string | null;
  warranty_until: string | null;
  warranty_days: number | null;
  warranty_conditions: string | null;
  warranty_active: boolean;
  work_performed: string | null;
  used_parts: string | null;
  internal_observations: string | null;
  notes: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  repair_access_customers: {
    id: string;
    full_name: string;
    phone: string | null;
    alternate_phone: string | null;
    phone_normalized: string | null;
    dni: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  } | null;
  repair_access_devices: {
    id: string;
    device_type: string;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    accessory_details: string | null;
    visual_condition: string | null;
    notes: string | null;
  } | null;
};

export type RepairAccessOrderRecord = {
  id: string;
  intakeDate: string;
  issueReported: string;
  technicalDiagnosis: string | null;
  budgetAmount: number;
  approvedAmount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentNotes: string | null;
  isPaid: boolean;
  paidAt: string | null;
  deliveredAt: string | null;
  warrantyUntil: string | null;
  warrantyDays: number;
  warrantyConditions: string | null;
  warrantyActive: boolean;
  workPerformed: string | null;
  usedParts: string | null;
  internalObservations: string | null;
  notes: string | null;
  priority: string | null;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    alternatePhone: string;
    phoneNormalized: string;
    dni: string;
    email: string;
    address: string;
    notes: string;
  };
  device: {
    id: string;
    deviceType: string;
    brand: string;
    model: string;
    serialNumber: string;
    accessoryDetails: string;
    visualCondition: string;
    notes: string;
  };
};

export type RepairAccessCustomerSummary = {
  id: string;
  fullName: string;
  phone: string;
  alternatePhone: string;
  dni: string;
  email: string;
  address: string;
  source: string;
  createdAt: string;
};

export type RepairAccessImportSummary = {
  id: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
};

export type RepairAccessSummary = {
  totalOrders: number;
  totalCustomers: number;
  activeOrders: number;
  paidOrders: number;
  pendingBudget: number;
  totalProjected: number;
  totalCollected: number;
  intakeToday: number;
  deliveredToday: number;
  collectedToday: number;
  readyToPickup: number;
  waitingCustomer: number;
  delayedOrders: number;
  activeWarranties: number;
  statusCounts: Record<string, number>;
};

function toDateOnly(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

function getDaysOpen(intakeDate: string) {
  const intake = new Date(`${intakeDate}T00:00:00`);
  if (Number.isNaN(intake.getTime())) return 0;
  const diff = Date.now() - intake.getTime();
  return Math.floor(diff / 86_400_000);
}

export async function getRepairsAccessDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repair_access_orders")
    .select(
      `
        id,
        intake_date,
        issue_reported,
        technical_diagnosis,
        budget_amount,
        approved_amount,
        final_amount,
        payment_method,
        payment_notes,
        is_paid,
        paid_at,
        delivered_at,
        warranty_until,
        warranty_days,
        warranty_conditions,
        warranty_active,
        work_performed,
        used_parts,
        internal_observations,
        notes,
        priority,
        status,
        created_at,
        repair_access_customers (
          id,
          full_name,
          phone,
          alternate_phone,
          phone_normalized,
          dni,
          email,
          address,
          notes
        ),
        repair_access_devices (
          id,
          device_type,
          brand,
          model,
          serial_number,
          accessory_details,
          visual_condition,
          notes
        )
      `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const orders: RepairAccessOrderRecord[] = (data ?? []).map((order: RawOrder) => ({
    id: order.id,
    intakeDate: order.intake_date,
    issueReported: order.issue_reported,
    technicalDiagnosis: order.technical_diagnosis,
    budgetAmount: Number(order.budget_amount ?? 0),
    approvedAmount: Number(order.approved_amount ?? 0),
    finalAmount: Number(order.final_amount ?? 0),
    paymentMethod: order.payment_method ?? "efectivo",
    paymentNotes: order.payment_notes,
    isPaid: order.is_paid,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at,
    warrantyUntil: order.warranty_until,
    warrantyDays: Number(order.warranty_days ?? 0),
    warrantyConditions: order.warranty_conditions,
    warrantyActive: order.warranty_active,
    workPerformed: order.work_performed,
    usedParts: order.used_parts,
    internalObservations: order.internal_observations,
    notes: order.notes,
    priority: order.priority,
    status: order.status,
    createdAt: order.created_at,
    customer: {
      id: order.repair_access_customers?.id ?? "",
      fullName: order.repair_access_customers?.full_name ?? "Sin cliente",
      phone: order.repair_access_customers?.phone ?? "",
      alternatePhone: order.repair_access_customers?.alternate_phone ?? "",
      phoneNormalized: order.repair_access_customers?.phone_normalized ?? "",
      dni: order.repair_access_customers?.dni ?? "",
      email: order.repair_access_customers?.email ?? "",
      address: order.repair_access_customers?.address ?? "",
      notes: order.repair_access_customers?.notes ?? ""
    },
    device: {
      id: order.repair_access_devices?.id ?? "",
      deviceType: order.repair_access_devices?.device_type ?? "Equipo",
      brand: order.repair_access_devices?.brand ?? "",
      model: order.repair_access_devices?.model ?? "",
      serialNumber: order.repair_access_devices?.serial_number ?? "",
      accessoryDetails: order.repair_access_devices?.accessory_details ?? "",
      visualCondition: order.repair_access_devices?.visual_condition ?? "",
      notes: order.repair_access_devices?.notes ?? ""
    }
  }));

  const today = new Date().toISOString().slice(0, 10);
  const statusCounts = repairAccessStatusValues.reduce<Record<string, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  orders.forEach((order) => {
    statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
  });

  const closedStatuses = ["entregado", "cobrado", "rechazado_por_cliente", "cancelado", "dado_de_baja"];
  const activeOrders = orders.filter((order) => !closedStatuses.includes(order.status)).length;
  const paidOrders = orders.filter((order) => order.isPaid).length;
  const pendingBudget = orders.filter((order) => ["pendiente_revision", "en_revision"].includes(order.status)).length;
  const totalProjected = orders.reduce((acc, order) => acc + (order.finalAmount || order.approvedAmount || order.budgetAmount || 0), 0);
  const totalCollected = orders.reduce((acc, order) => acc + (order.isPaid ? order.finalAmount || order.approvedAmount || order.budgetAmount || 0 : 0), 0);
  const delayedOrders = orders.filter((order) => !closedStatuses.includes(order.status) && getDaysOpen(order.intakeDate) >= 7).length;

  const [customerCount, recentCustomers, latestImport] = await Promise.all([
    (supabase as any)
      .from("repair_access_customers")
      .select("id", { count: "exact", head: true }),
    (supabase as any)
      .from("repair_access_customers")
      .select("id, full_name, phone, alternate_phone, dni, email, address, source, created_at")
      .order("created_at", { ascending: false })
      .limit(24),
    (supabase as any)
      .from("repair_access_import_batches")
      .select("id, file_name, total_rows, imported_count, updated_count, duplicate_count, error_count, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (customerCount.error) throw new Error(customerCount.error.message);
  if (recentCustomers.error) throw new Error(recentCustomers.error.message);
  if (latestImport.error) throw new Error(latestImport.error.message);

  return {
    orders,
    customers: (recentCustomers.data ?? []).map((customer: any) => ({
      id: customer.id,
      fullName: customer.full_name,
      phone: customer.phone ?? "",
      alternatePhone: customer.alternate_phone ?? "",
      dni: customer.dni ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      source: customer.source,
      createdAt: customer.created_at
    })),
    latestImport: latestImport.data
      ? {
          id: latestImport.data.id,
          fileName: latestImport.data.file_name,
          totalRows: latestImport.data.total_rows,
          importedCount: latestImport.data.imported_count,
          updatedCount: latestImport.data.updated_count,
          duplicateCount: latestImport.data.duplicate_count,
          errorCount: latestImport.data.error_count,
          createdAt: latestImport.data.created_at
        }
      : null,
    summary: {
      totalOrders: orders.length,
      totalCustomers: customerCount.count ?? 0,
      activeOrders,
      paidOrders,
      pendingBudget,
      totalProjected,
      totalCollected,
      intakeToday: orders.filter((order) => toDateOnly(order.intakeDate) === today).length,
      deliveredToday: orders.filter((order) => toDateOnly(order.deliveredAt) === today).length,
      collectedToday: orders.filter((order) => toDateOnly(order.paidAt) === today).length,
      readyToPickup: orders.filter((order) => ["terminado", "listo_para_retirar"].includes(order.status)).length,
      waitingCustomer: orders.filter((order) => order.status === "esperando_confirmacion_cliente").length,
      delayedOrders,
      activeWarranties: orders.filter((order) => order.warrantyActive).length,
      statusCounts
    }
  };
}
