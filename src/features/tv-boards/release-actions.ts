"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { formatCashMethod } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/form-state";
const commandSchema = z.object({
  id: z.string().uuid(), version: z.coerce.number().int().positive(), operationId: z.string().uuid(),
  method: z.enum(["nx", "mp"], { message: "Selecciona NX Santi o NX Local como cuenta de destino." })
});
const receiptSchema = z.object({ id: z.string().uuid(), version: z.number().int().positive(),
  status: z.literal("released"), kind: z.literal("confirm_release"), replayed: z.boolean(),
  saleId: z.string().uuid(), saleNumber: z.string().min(1), method: z.enum(["nx", "mp"]) });
export async function releaseTvBoardToSaleAction(input: unknown): Promise<ActionResult & { recordVersion?: number; conflict?: boolean; saleId?: string; saleNumber?: string }> {
  await requireAdmin();
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const command = parsed.data;
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as any).rpc("release_tv_board_to_sale", {
    p_board_id: command.id, p_expected_version: command.version, p_operation_id: command.operationId, p_method: command.method
  });
  if (error) return { success: false, conflict: error.code === "40001", message: error.code === "40001"
    ? "La placa cambio en otro dispositivo. Actualiza el listado antes de confirmar."
    : ["23514", "42501", "P0002"].includes(error.code) ? error.message
    : "No se pudo confirmar la liberacion. Reintenta sin cambiar los datos para recuperar el resultado sin duplicarlo." };
  const receipt = receiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.id !== command.id || receipt.data.version <= command.version || receipt.data.method !== command.method) {
    return { success: false, message: "No se pudo verificar el registro. Reintenta sin cambiar los datos para recuperar la misma venta." };
  }
  for (const path of ["/placas-tv", "/ventas", "/caja", "/dashboard", "/reportes", "/sueldo"]) revalidatePath(path);
  return { success: true, recordVersion: receipt.data.version, saleId: receipt.data.saleId, saleNumber: receipt.data.saleNumber,
    message: `${receipt.data.replayed ? "Ya estaba registrada" : "Liberacion registrada"}: venta ${receipt.data.saleNumber}, cobrada en ${formatCashMethod(command.method)}.` };
}
