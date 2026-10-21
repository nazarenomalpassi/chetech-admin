"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/form-state";
import { warrantyReturnSaveSchema, warrantyReturnStartSchema } from "./warranty-return";
import { repairWarrantyFieldsSchema } from "./schemas";

export async function correctRepairWarranty(_previous: ActionResult | null, form: FormData): Promise<ActionResult & { recordVersion?: number }> {
  await requireAdmin();
  const parsed = repairWarrantyFieldsSchema.and(z.object({
    id: z.string().uuid(), expectedVersion: z.coerce.number().int().positive(), operationId: z.string().uuid(),
    reason: z.string().trim().min(3, "Indica el motivo de la correccion de garantia.").max(2000),
    confirmCorrection: z.literal(true, { errorMap: () => ({ message: "Confirma la correccion desde el retiro original." }) })
  })).safeParse({ ...Object.fromEntries(form), hasWarranty: form.get("hasWarranty") === "on",
    warrantyDays: form.get("hasWarranty") === "on" ? form.get("warrantyDays") : 0,
    confirmCorrection: form.get("confirmCorrection") === "on" });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  return execute("workshop_warranty_correct", { p_order_id: p.id, p_expected_version: p.expectedVersion, p_operation_id: p.operationId,
    p_has_warranty: p.hasWarranty, p_warranty_days: p.warrantyDays, p_conditions: p.warrantyConditions,
    p_reason: p.reason, p_confirm: p.confirmCorrection }, "Garantia corregida desde el retiro original. Se conservaron la entrega y los cobros.");
}

async function execute(rpc: string, args: Record<string, unknown>, message: string): Promise<ActionResult & { recordVersion?: number }> {
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as any).rpc(rpc, args);
  if (error) return { success: false, message: error.code === "40001"
    ? "La ficha cambio en otro dispositivo. Tus datos se conservan; actualiza antes de reintentar."
    : ["23514", "42501", "P0002"].includes(error.code) ? error.message
    : "No se pudo guardar el reingreso. Conserva tus datos y reintenta." };
  const receipt = z.object({ id: z.string().uuid(), version: z.number().int().positive(), replayed: z.boolean() }).safeParse(data);
  if (!receipt.success || (rpc === "workshop_warranty_save" && receipt.data.id !== args.p_return_id)
    || (rpc === "workshop_warranty_correct" && receipt.data.id !== args.p_order_id)) return { success: false, message: "No se pudo confirmar el resultado. Reintenta sin cambiar los datos para recuperar el guardado." };
  revalidatePath("/reparaciones-access");
  return { success: true, recordVersion: receipt.data.version, message: receipt.data.replayed ? "Este cambio ya estaba guardado. Ficha actualizada." : message };
}

export async function startWarrantyReturn(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = warrantyReturnStartSchema.safeParse({ ...Object.fromEntries(form), acknowledgeCoverage: form.get("acknowledgeCoverage") === "on" });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  return execute("workshop_warranty_start", {
    p_order_id: p.id, p_expected_version: p.version, p_operation_id: p.operationId,
    p_received_on: p.receivedOn, p_issue: p.issueReported, p_accessories: p.accessories,
    p_condition_notes: p.conditionNotes, p_acknowledge_coverage: p.acknowledgeCoverage
  }, "Reingreso por garantia registrado en la misma orden. El taller ya puede verlo.");
}

export async function saveWarrantyReturn(_previous: ActionResult | null, form: FormData): Promise<ActionResult & { recordVersion?: number }> {
  const user = await requirePermission("repairs.update");
  const parsed = warrantyReturnSaveSchema.safeParse({ ...Object.fromEntries(form), confirmDelivery: form.get("confirmDelivery") === "on" });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  if (p.status === "retirado" && (user.role !== "admin" || !p.confirmDelivery || p.recipient.length < 2)) {
    return { success: false, message: user.role !== "admin" ? "El retiro se registra desde administracion." : "Indica quien retira y confirma la devolucion del equipo." };
  }
  return execute("workshop_warranty_save", {
    p_return_id: p.id, p_expected_version: p.version, p_operation_id: p.operationId,
    p_status: p.status, p_progress: p.progress, p_resolution: p.resolution,
    p_recipient: p.status === "retirado" ? p.recipient : ""
  }, p.status === "retirado" ? "Retiro de garantia registrado. Se conservaron la orden original y los cobros." : "Avance de garantia guardado. El taller y mostrador ya pueden verlo.");
}
