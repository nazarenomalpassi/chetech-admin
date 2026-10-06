import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getWorkshopCohort, workshopBusinessReportSchema, type WorkshopBusinessReportResult } from "./model";

export async function getWorkshopBusinessReport(from?: string, to?: string): Promise<WorkshopBusinessReportResult> {
  await requirePermission("reports.manage");
  const range = getWorkshopCohort(from, to);
  const supabase = await createServerSupabaseClient();
  const client = supabase as unknown as {
    rpc(name: string, args: { p_from: string; p_to: string }): Promise<{
      data: unknown; error: { code?: string; message: string } | null;
    }>;
  };
  const { data, error } = await client.rpc("get_workshop_business_report", { p_from: range.from, p_to: range.to });
  if (error?.code === "PGRST202" || error?.code === "42883") return { range, report: null, migrationReady: false };
  if (error) throw new Error(error.message);
  return { range, report: workshopBusinessReportSchema.parse(data), migrationReady: true };
}
