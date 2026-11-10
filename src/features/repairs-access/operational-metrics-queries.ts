import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOperationalMetricsRange, workshopOperationalMetricsSchema, type WorkshopOperationalMetricsSnapshot } from "./operational-metrics";

type MetricsRpcClient = {
  rpc(name: "get_workshop_operational_metrics", args: { p_from: string; p_to: string }): PromiseLike<{
    data: unknown; error: { code?: string; message?: string } | null;
  }>;
};

export async function getWorkshopOperationalMetrics(params: { from?: string; to?: string } = {}): Promise<WorkshopOperationalMetricsSnapshot | null> {
  const range = getOperationalMetricsRange(params);
  const supabase = await createServerSupabaseClient();
  // Until the principal adds the migration/generated DB types, type only this RPC boundary.
  const { data, error } = await (supabase as unknown as MetricsRpcClient).rpc("get_workshop_operational_metrics", { p_from: range.from, p_to: range.to });
  if (error?.code === "PGRST202" || error?.code === "42883") return null;
  if (error) throw new Error("No se pudieron consultar las metricas del taller.");
  const parsed = workshopOperationalMetricsSchema.safeParse(data);
  if (!parsed.success) throw new Error("La respuesta de metricas no es valida. Reintenta o revisa la integracion.");
  return parsed.data;
}
