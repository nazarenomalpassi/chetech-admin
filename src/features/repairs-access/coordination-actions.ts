"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFriendlyDatabaseError } from "@/lib/supabase/rpc-errors";
import type { ActionResult } from "@/lib/form-state";
import { repairAccessWorkshopSchema } from "./schemas";

const uuid = z.string().uuid("No se pudo identificar el registro.");
const version = z.coerce.number().int().positive("Actualiza la orden antes de guardar.");
const optionalText = (max = 2000) => z.string().max(max).default("");
const decisionSchema = z.object({ id: uuid, version, operationId: uuid, decision: z.enum(["accepted", "rejected", "revoked"]), channel: z.enum(["presencial", "telefono", "whatsapp", "portal"]), notes: optionalText() });
const partSchema = z.object({ id: uuid, operationId: uuid, description: z.string().trim().min(3, "Describe el repuesto.").max(500), quantity: z.coerce.number().int().min(1).max(10000), priority: z.enum(["normal", "alta", "urgente"]), notes: optionalText(), productId: uuid.or(z.literal("")).default(""), productSku: optionalText(100) });
const managePartSchema = z.object({ id: uuid, version, action: z.enum(["order", "receive", "reserve", "install", "cancel"]), quantity: z.coerce.number().int().min(0).default(0), supplier: optionalText(200), unitCost: z.coerce.number().min(0).optional(), expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), notes: optionalText() });

function values(form: FormData) {
  return Object.fromEntries(Array.from(form.entries()).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

async function execute(rpc: string, args: Record<string, unknown>, success: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const result = await (supabase as any).rpc(rpc, args);
  if (result.error) {
    const fallback = "No se pudo guardar. Tus datos siguen disponibles para reintentar.";
    const message = result.error.code === "40001"
      ? "Este registro cambio en otro dispositivo. Actualiza y revisa tus datos antes de guardar."
      : rpc === "workshop_save" ? getFriendlyDatabaseError(result.error, fallback) : result.error.message || fallback;
    return { success: false, message };
  }
  revalidatePath("/reparaciones-access");
  revalidatePath("/pedidos");
  revalidatePath("/dashboard");
  return { success: true, message: success };
}

export async function saveWorkshopForm(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requirePermission("repairs.update");
  const parsed = repairAccessWorkshopSchema.safeParse({
    ...values(form), repairAmount: form.get("repairAmount") || 0
  });
  const expectedVersion = version.safeParse(form.get("expectedVersion"));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  if (!expectedVersion.success) return { success: false, message: "Actualiza la orden antes de guardar." };
  const p = parsed.data;
  return execute("workshop_save", {
    p_order_id: p.id, p_expected_version: expectedVersion.data,
    p_payload: {
      status: p.status,
      ...(form.has("repairAmount") ? { budget_amount: p.repairAmount } : {}),
      budget_detail: p.budgetDetail, repair_progress: p.repairProgress,
      quality_checked: form.get("qualityChecked") === "on",
      quality_notes: String(form.get("qualityNotes") ?? "").slice(0, 2000)
    }
  }, "Actualizacion guardada. Mostrador puede ver el avance.");
}

export async function confirmRepairCustomerDecision(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = decisionSchema.safeParse(values(form));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  return execute("workshop_decide", { p_order_id: p.id, p_expected_version: p.version, p_operation_id: p.operationId, p_decision: p.decision, p_channel: p.channel, p_notes: p.notes }, "Decision del cliente registrada y comunicada al taller.");
}

export async function requestRepairPart(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requirePermission("repairs.update");
  const parsed = partSchema.safeParse(values(form));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  let productId = p.productId || null;
  if (p.productSku.trim()) {
    const supabase = await createServerSupabaseClient();
    const match = await (supabase as any).rpc("get_workshop_product_id", { p_sku: p.productSku });
    if (match.error || !match.data) return { success: false, message: "No se encontro ese SKU. Revisa el codigo o solicita el repuesto sin vincular un producto." };
    productId = match.data;
  }
  return execute("workshop_request_part", { p_order_id: p.id, p_operation_id: p.operationId, p_description: p.description, p_quantity: p.quantity, p_priority: p.priority, p_notes: p.notes, p_product_id: productId }, "Repuesto solicitado. Mostrador ya puede gestionarlo en Pedidos.");
}

export async function manageRepairPart(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requirePermission("repairs.update");
  const parsed = managePartSchema.safeParse({ ...values(form), unitCost: form.get("unitCost") || undefined });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  if (p.action !== "install" && user.role !== "admin") return { success: false, message: "La compra y recepcion se gestionan desde mostrador." };
  return execute("workshop_manage_part", { p_id: p.id, p_expected_version: p.version, p_action: p.action, p_quantity: p.quantity, p_supplier: p.supplier || null, p_unit_cost: p.unitCost ?? null, p_expected_date: p.expectedDate || null, p_notes: p.notes }, "Repuesto actualizado. El taller recibira la novedad.");
}

export async function assignRepairResponsibility(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, version, technicianId: uuid.or(z.literal("")), location: optionalText(200), nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) }).safeParse(values(form));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  return execute("workshop_save", { p_order_id: p.id, p_expected_version: p.version, p_payload: { technician_id: p.technicianId || null, physical_location: p.location, next_action_date: p.nextActionDate } }, "Responsable y proxima revision guardados.");
}

export async function claimRepairOrder(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requirePermission("repairs.update");
  const parsed = z.object({ id: uuid, version }).safeParse(values(form));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  return execute("workshop_claim_order", { p_order_id: parsed.data.id, p_expected_version: parsed.data.version }, "Orden asignada a tu cuenta. La toma de responsabilidad quedo registrada.");
}

export async function deliverRepairOrder(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, version, recipient: z.string().trim().min(2, "Indica quien retira."), notes: optionalText(), allowBalance: z.boolean() }).safeParse({ ...values(form), allowBalance: form.get("allowBalance") === "on" });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  return execute("workshop_deliver", { p_order_id: p.id, p_expected_version: p.version, p_recipient: p.recipient, p_notes: p.notes, p_allow_balance: p.allowBalance }, "Entrega registrada. Se conservaron los cobros y el historial.");
}
