import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkshopPart } from "./workflow";

export type WorkshopInbox = {
  tasks: { id: string; orderId: string; repairNumber: string; kind: string; title: string; assignedTo: string | null; dueDate: string | null; createdAt: string }[];
  technicians: { id: string; name: string }[];
  counts: { unassigned: number; waitingCustomer: number; awaitingReturn: number; ready: number; blockedParts: number };
};

export async function getWorkshopInbox(): Promise<WorkshopInbox | null> {
  const supabase = await createServerSupabaseClient();
  const result = await (supabase as any).rpc("get_workshop_inbox");
  if (result.error?.code === "PGRST202" || result.error?.code === "42883") return null;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export type PartInboxItem = WorkshopPart & { repairNumber: string; customerName: string };

export async function getRepairPartsInbox(): Promise<PartInboxItem[]> {
  const supabase = await createServerSupabaseClient();
  const result = await (supabase as any).from("repair_part_requests").select("*,repair_access_orders(repair_number,repair_access_customers(full_name))").neq("status", "cancelled").neq("status", "installed").order("created_at", { ascending: true }).limit(100);
  if (result.error?.code === "42P01" || result.error?.code === "PGRST205") return [];
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map((p: any) => ({ id: p.id, orderId: p.order_id, description: p.description, quantity: p.quantity, receivedQuantity: p.received_quantity, installedQuantity: p.installed_quantity, status: p.status, priority: p.priority, supplier: p.supplier, expectedDate: p.expected_date, notes: p.notes, unitCost: p.unit_cost === null ? null : Number(p.unit_cost), productId: p.product_id, version: p.version, createdAt: p.created_at, repairNumber: p.repair_access_orders?.repair_number ?? "Sin numero", customerName: p.repair_access_orders?.repair_access_customers?.full_name ?? "" }));
}
