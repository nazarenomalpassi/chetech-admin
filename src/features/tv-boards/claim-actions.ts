"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tvBoardSaleCommandSchema } from "./claims";
import type { ActionResult } from "@/lib/form-state";
import { getTvBoardSaleStatus, type TvBoardSaleStatus } from "./sales";

export async function changeTvBoardSaleAction(input: unknown): Promise<ActionResult & { recordVersion?: number; conflict?: boolean }> {
  await requireAdmin();
  const parsed = tvBoardSaleCommandSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const command = parsed.data;
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as any).rpc("tv_board_sale_transition", {
    p_board_id: command.id, p_expected_version: command.version, p_operation_id: command.operationId,
    p_kind: command.kind, p_notes: command.notes
  });
  if (error) return { success: false, conflict: error.code === "40001", message: error.code === "40001"
    ? "La placa cambio en otro dispositivo. Tus notas se conservan; actualiza antes de continuar."
    : ["23514", "42501", "P0002"].includes(error.code) ? error.message
    : "No se pudo guardar el seguimiento. Tus notas se conservan; reintenta." };
  const receipt = z.object({ id: z.string().uuid(), version: z.number().int().positive(), status: z.string(), kind: z.string(), replayed: z.boolean() }).safeParse(data);
  const expectedStatus = { start_claim: "claim_open", resume_sale: "pending_release", cancel_sale: "cancelled", confirm_release: "released" }[command.kind];
  if (!receipt.success || receipt.data.id !== command.id || receipt.data.version <= command.version || receipt.data.kind !== command.kind || receipt.data.status !== expectedStatus) {
    return { success: false, message: "No se pudo confirmar el resultado. Reintenta sin cambiar los datos para recuperar el guardado." };
  }
  revalidatePath("/placas-tv");
  revalidatePath("/dashboard");
  const messages = {
    start_claim: "Reclamo registrado. El importe paso de pendiente a dinero retenido.",
    resume_sale: "Reclamo resuelto. La venta volvio a pendiente de confirmar liberacion.",
    cancel_sale: "Venta anulada. Se retiro de los importes a cobrar y se conservo el historial.",
    confirm_release: "Liberacion confirmada. No se generaron movimientos de caja."
  };
  return { success: true, recordVersion: receipt.data.version, message: receipt.data.replayed ? "Este cambio ya estaba guardado. Listado actualizado." : messages[command.kind] };
}

export async function refreshTvBoardSaleStateAction(input: unknown): Promise<ActionResult & { state?: { id: string; version: number; status: TvBoardSaleStatus } }> {
  await requireAdmin();
  const parsed = z.string().uuid().safeParse(input);
  if (!parsed.success) return { success: false, message: "Selecciona una placa valida." };
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as any).from("tv_boards")
    .select("id,financial_version,claim_status,sold_at,released_at").eq("id", parsed.data).maybeSingle();
  const current = z.object({ id: z.literal(parsed.data), financial_version: z.number().int().positive(), claim_status: z.enum(["none", "open", "cancelled"]), sold_at: z.string().nullable(), released_at: z.string().nullable() }).safeParse(data);
  if (error || !current.success) return { success: false, message: "No se pudo actualizar la placa. Tus notas se conservan; reintenta." };
  const row = current.data;
  return { success: true, message: "Estado actualizado. Revisa la accion antes de volver a guardar.", state: {
    id: row.id, version: row.financial_version, status: getTvBoardSaleStatus({ soldAt: row.sold_at, releasedAt: row.released_at, claimStatus: row.claim_status })
  } };
}
