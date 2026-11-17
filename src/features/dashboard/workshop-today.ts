import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const count = z.number().int().nonnegative();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const workshopTodaySchema = z.object({
  asOf: dateOnly,
  stages: z.object({
    review: count,
    waitingCustomer: count,
    inProgress: count,
    ready: count,
    toReturn: count
  }),
  attention: z.object({
    open: count,
    over30Days: count,
    blockedParts: count
  }),
  oldestReady: z.array(
    z.object({
      id: z.string().uuid(),
      repairNumber: z.string().nullable(),
      intakeDate: dateOnly.nullable(),
      readyOn: dateOnly.nullable(),
      budgetAmount: z.number(),
      finalAmount: z.number(),
      customerName: z.string(),
      phone: z.string(),
      device: z.string()
    })
  )
});

export type WorkshopToday = z.infer<typeof workshopTodaySchema>;
export type WorkshopTodayReadyOrder = WorkshopToday["oldestReady"][number];

type TodayRpcClient = {
  rpc(name: "get_workshop_today"): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

/** Devuelve null si la función todavía no está en la base (vista previa sin migrar). */
export async function getWorkshopToday(): Promise<WorkshopToday | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as TodayRpcClient).rpc("get_workshop_today");
  if (error?.code === "PGRST202" || error?.code === "42883") return null;
  if (error) throw new Error("No se pudo consultar el estado del taller.");
  const parsed = workshopTodaySchema.safeParse(data);
  if (!parsed.success) throw new Error("La respuesta del estado del taller no es válida.");
  return parsed.data;
}

/** Días completos entre una fecha (AAAA-MM-DD) y hoy en el local. */
export function daysSince(date: string | null, today: string) {
  if (!date) return null;
  const from = Date.parse(`${date}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}
