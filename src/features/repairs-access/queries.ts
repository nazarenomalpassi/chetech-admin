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
  notes: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  repair_access_customers: {
    id: string;
    full_name: string;
    phone: string | null;
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
  notes: string | null;
  priority: string | null;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    fullName: string;
    phone: string;
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
        notes,
        priority,
        status,
        created_at,
        repair_access_customers (
          id,
          full_name,
          phone,
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
    notes: order.notes,
    priority: order.priority,
    status: order.status,
    createdAt: order.created_at,
    customer: {
      id: order.repair_access_customers?.id ?? "",
      fullName: order.repair_access_customers?.full_name ?? "Sin cliente",
      phone: order.repair_access_customers?.phone ?? "",
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

  const activeOrders = orders.filter((order: RepairAccessOrderRecord) => !["entregado", "cobrado", "rechazado", "dado_de_baja"].includes(order.status)).length;
  const paidOrders = orders.filter((order: RepairAccessOrderRecord) => order.isPaid).length;
  const pendingBudget = orders.filter((order: RepairAccessOrderRecord) => order.status === "presupuestado").length;
  const totalProjected = orders.reduce((acc: number, order: RepairAccessOrderRecord) => acc + (order.finalAmount || order.approvedAmount || order.budgetAmount || 0), 0);

  return {
    orders,
    summary: {
      totalOrders: orders.length,
      activeOrders,
      paidOrders,
      pendingBudget,
      totalProjected
    }
  };
}
