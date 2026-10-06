import { getVisitsTodayDashboardSummary } from "@/features/visits/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTechnicianRepairSummary } from "@/features/dashboard/technician-summary";

type TechnicalOrderRow = {
  id: string;
  repair_number: string | null;
  intake_date: string;
  issue_reported: string;
  status: string;
  technician_id: string | null;
  repair_access_customers: { full_name: string } | { full_name: string }[] | null;
  repair_access_devices: {
    device_type: string;
    brand: string | null;
    model: string | null;
  } | Array<{
    device_type: string;
    brand: string | null;
    model: string | null;
  }> | null;
};

type TechnicianDashboardOrder = {
  id: string;
  repairNumber: string;
  intakeDate: string;
  issueReported: string;
  status: string;
  technicianId: string | null;
  customerName: string;
  device: string;
};

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getTechnicianDashboardData(userId: string) {
  const supabase = await createServerSupabaseClient();
  const [ordersResult, visits] = await Promise.all([
    (supabase as any).rpc("get_technician_repair_dashboard_orders"),
    getVisitsTodayDashboardSummary()
  ]);

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message);
  }

  const rows = (ordersResult.data ?? []) as Array<{ payload: TechnicalOrderRow }>;
  const orders: TechnicianDashboardOrder[] = rows.map((row) => {
    const order = row.payload;
    const customer = firstRelation(order.repair_access_customers);
    const device = firstRelation(order.repair_access_devices);

    return {
      id: order.id,
      repairNumber: order.repair_number ?? "Sin numero",
      intakeDate: order.intake_date,
      issueReported: order.issue_reported,
      status: order.status,
      technicianId: order.technician_id,
      customerName: customer?.full_name ?? "Sin cliente",
      device: [device?.device_type, device?.brand, device?.model].filter(Boolean).join(" - ") || "Equipo"
    };
  });

  return {
    summary: buildTechnicianRepairSummary(orders, userId),
    recentOrders: orders.filter((order) => order.status !== "retirado").slice(0, 6),
    visits
  };
}
