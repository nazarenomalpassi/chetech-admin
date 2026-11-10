import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupplierClaim, WorkshopPartsPage } from "./supplier-claims";

function pageNumber(input?: string) {
  return Math.max(1, Math.min(100000, Math.floor(Number(input) || 1)));
}
const statuses = [
  "all",
  "requested",
  "ordered",
  "received",
  "available",
  "installed",
  "overdue",
];

export async function getWorkshopPartsPage(
  input: { page?: string; search?: string; status?: string } = {},
): Promise<WorkshopPartsPage> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc(
    "get_workshop_parts_page",
    {
      p_page: pageNumber(input.page),
      p_search: (input.search ?? "").trim().slice(0, 200),
      p_status: statuses.includes(input.status ?? "") ? input.status : "all",
    },
  );
  if (error) throw new Error(error.message);
  return data;
}

export type SupplierClaimsPage = {
  items: SupplierClaim[];
  total: number;
  page: number;
  pageSize: number;
};
export async function getSupplierClaimsPage(
  input: { closed?: boolean; page?: string } = {},
): Promise<SupplierClaimsPage> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc(
    "get_workshop_supplier_claims",
    { p_closed: input.closed === true, p_page: pageNumber(input.page) },
  );
  if (error) throw new Error(error.message);
  return data;
}
