import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrder, type RepairAccessOrderRecord, type RepairAccessSummary, type RepairAccessCustomerSummary, type RepairAccessImportSummary } from "./queries";
import type { WorkshopOrderContext } from "./workflow";

export type WorkshopPageInfo = { total: number; pageSize: number; cursor: string; nextCursor: string | null; search: string; status: string; warranty: string; scope: string };
const cursorSchema = z.object({ date: z.string().datetime({ offset: true }), id: z.string().uuid() });
export function decodeWorkshopCursor(cursor?: string) {
  if (!cursor || cursor.length > 300) return null;
  try { const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))); return parsed.success ? parsed.data : null; } catch { return null; }
}

export async function getRepairWorkshopPage(params: { q?: string; state?: string; warranty?: string; scope?: string; cursor?: string; order?: string }, includeAdministration: boolean) {
  const supabase = await createServerSupabaseClient();
  const cursor = decodeWorkshopCursor(params.cursor);
  const scope = ["all", "mine", "unassigned", "parts", "ready", "return", "waiting_customer", "approved", "overdue"].includes(params.scope ?? "") ? params.scope! : "all";
  const result = await (supabase as any).rpc("workshop_read_page", { p_search: (params.q ?? "").slice(0, 200), p_status: params.state ?? "todos", p_warranty: params.warranty ?? "todos", p_scope: scope, p_cursor_date: cursor?.date ?? null, p_cursor_id: cursor?.id ?? null, p_limit: 30 });
  if (result.error) throw new Error(result.error.message);
  const payload = result.data;
  const rawOrders = [...(payload.orders ?? [])];
  if (params.order && z.string().uuid().safeParse(params.order).success && !rawOrders.some((o: any) => o.id === params.order)) {
    const selected = await (supabase as any).rpc("workshop_order_payload", { p_order_id: params.order });
    if (selected.error) throw new Error(selected.error.message);
    if (selected.data) rawOrders.unshift(selected.data);
  }
  const orders: RepairAccessOrderRecord[] = rawOrders.map(mapOrder);
  const [contexts, customerResult, importResult] = await Promise.all([
    (supabase as any).rpc("get_workshop_context", { p_order_ids: orders.map((o) => o.id) }),
    includeAdministration ? (supabase as any).from("repair_access_customers").select("id,full_name,phone,alternate_phone,dni,email,address,notes,source,created_at").order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: [], error: null }),
    includeAdministration ? (supabase as any).from("repair_access_import_batches").select("id,file_name,total_rows,imported_count,updated_count,duplicate_count,error_count,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);
  for (const r of [contexts, customerResult, importResult]) if (r.error) throw new Error(r.error.message);
  const contextMap = new Map<string, WorkshopOrderContext>((contexts.data ?? []).map((c: WorkshopOrderContext & { id: string }) => [c.id, c]));
  orders.forEach((o) => { o.workflow = contextMap.get(o.id); });
  const customers: RepairAccessCustomerSummary[] = (customerResult.data ?? []).map((c: any) => ({ id: c.id, fullName: c.full_name, phone: c.phone ?? "", alternatePhone: c.alternate_phone ?? "", dni: c.dni ?? "", email: c.email ?? "", address: c.address ?? "", notes: c.notes ?? "", source: c.source, createdAt: c.created_at }));
  const i = importResult.data;
  const latestImport: RepairAccessImportSummary | null = i ? { id: i.id, fileName: i.file_name, totalRows: i.total_rows, importedCount: i.imported_count, updatedCount: i.updated_count, duplicateCount: i.duplicate_count, errorCount: i.error_count, createdAt: i.created_at } : null;
  return { orders, customers, latestImport, summary: payload.summary as RepairAccessSummary, pageInfo: { total: Number(payload.total), pageSize: 30, cursor: params.cursor ?? "", nextCursor: payload.nextCursor ? Buffer.from(JSON.stringify(payload.nextCursor)).toString("base64url") : null, search: params.q ?? "", status: params.state ?? "todos", warranty: params.warranty ?? "todos", scope } satisfies WorkshopPageInfo };
}
