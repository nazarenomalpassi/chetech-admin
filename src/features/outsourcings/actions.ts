"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  repairOutsourcingCancelSchema,
  repairOutsourcingFollowupSchema,
  repairOutsourcingQualitySchema,
  repairOutsourcingRetrievedSchema,
  repairOutsourcingSchema
} from "@/features/outsourcings/schemas";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/terciarizaciones?${params.toString()}` as Route);
}

function redirectWithStatus(status: string, formData: FormData): never {
  const value = formData.get("returnTo");
  const url = new URL(typeof value === "string" ? value : "/terciarizaciones", "http://localhost");
  if (url.origin !== "http://localhost" || url.pathname !== "/terciarizaciones") redirect(`/terciarizaciones?status=${status}` as Route);
  url.searchParams.delete("error"); url.searchParams.set("status", status);
  redirect(`${url.pathname}?${url.searchParams.toString()}` as Route);
}

function emptyToNull(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function appendNote(current: string | null, next: string) {
  return [emptyToNull(current), next].filter(Boolean).join("\n\n");
}

export async function saveRepairOutsourcingAction(formData: FormData) {
  const parsed = repairOutsourcingSchema.safeParse({
    repairAccessOrderId: formData.get("repairAccessOrderId"),
    workshopName: formData.get("workshopName"),
    sentAt: formData.get("sentAt"),
    responsibleName: formData.get("responsibleName") || undefined,
    promisedAt: formData.get("promisedAt"),
    expectedCost: formData.get("expectedCost"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la terciarizacion.");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const existingOrder = await (supabase as any)
    .from("repair_access_orders")
    .select("id, repair_number")
    .eq("id", parsed.data.repairAccessOrderId)
    .maybeSingle();

  if (existingOrder.error || !existingOrder.data) {
    redirectWithError(existingOrder.error?.message ?? "No se encontro la orden de reparacion.");
  }

  const activeOutsourcing = await (supabase as any)
    .from("repair_outsourcings")
    .select("id")
    .eq("repair_access_order_id", parsed.data.repairAccessOrderId)
    .eq("status", "en_taller")
    .maybeSingle();

  if (activeOutsourcing.error) {
    redirectWithError(activeOutsourcing.error.message);
  }

  if (activeOutsourcing.data?.id) {
    redirectWithError("Esa orden ya esta marcada como llevada a un taller externo.");
  }

  const payload = {
    repair_access_order_id: parsed.data.repairAccessOrderId,
    workshop_name: parsed.data.workshopName.trim(),
    sent_at: parsed.data.sentAt,
    status: "en_taller",
    responsible_name: parsed.data.responsibleName || user.full_name,
    promised_at: parsed.data.promisedAt,
    expected_cost: parsed.data.expectedCost,
    notes: emptyToNull(parsed.data.notes),
    created_by: user.id,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await (supabase as any)
    .from("repair_outsourcings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    redirectWithError(error?.message ?? "No se pudo guardar la terciarizacion.");
  }

  await createAuditLog({
    entityType: "repair_outsourcings",
    entityId: data.id,
    action: "insert",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/terciarizaciones");
  revalidatePath("/reparaciones-access");
  redirectWithStatus("outsourcing_created", formData);
}

export async function markRepairOutsourcingRetrievedAction(formData: FormData) {
  const parsed = repairOutsourcingRetrievedSchema.safeParse({
    id: formData.get("id"),
    retrievedAt: formData.get("retrievedAt"),
    actualCost: formData.get("actualCost"),
    qualityStatus: formData.get("qualityStatus") || undefined,
    qualityNotes: formData.get("qualityNotes") || undefined,
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el retiro.");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const previous = await (supabase as any)
    .from("repair_outsourcings")
    .select("id, status, notes, sent_at, updated_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (previous.error || !previous.data) {
    redirectWithError(previous.error?.message ?? "No se encontro la terciarizacion.");
  }

  if (previous.data.status !== "en_taller") redirectWithError("El equipo ya no esta en el taller externo.");
  if (parsed.data.retrievedAt < previous.data.sent_at) redirectWithError("El retorno no puede ser anterior al envio.");
  if (formData.get("expectedUpdatedAt") && formData.get("expectedUpdatedAt") !== previous.data.updated_at) {
    redirectWithError("La terciarizacion cambio. Actualiza la pagina antes de registrar el retorno.");
  }

  const retrievedNote = [
    `Equipo buscado del taller externo el ${parsed.data.retrievedAt}.`,
    emptyToNull(parsed.data.notes),
    parsed.data.qualityNotes ? `Control (${parsed.data.qualityStatus}): ${parsed.data.qualityNotes}` : null
  ].filter(Boolean).join(" ");

  const payload = {
    status: "retirado",
    retrieved_at: parsed.data.retrievedAt,
    actual_cost: parsed.data.actualCost,
    quality_status: parsed.data.qualityStatus,
    quality_notes: emptyToNull(parsed.data.qualityNotes),
    quality_checked_at: parsed.data.qualityStatus === "pendiente" ? null : new Date().toISOString(),
    quality_checked_by: parsed.data.qualityStatus === "pendiente" ? null : user.id,
    notes: appendNote(previous.data.notes, retrievedNote),
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  const { data: updated, error } = await (supabase as any)
    .from("repair_outsourcings")
    .update(payload)
    .eq("id", parsed.data.id).eq("status", "en_taller").eq("updated_at", previous.data.updated_at).select("id").maybeSingle();

  if (error) redirectWithError(error.message);
  if (!updated) redirectWithError("El registro cambio. Actualiza la pagina; no se sobrescribio el historial.");

  await createAuditLog({
    entityType: "repair_outsourcings",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: { previousStatus: previous.data.status, ...payload }
  });

  revalidatePath("/terciarizaciones");
  redirectWithStatus("outsourcing_retrieved", formData);
}

export async function cancelRepairOutsourcingAction(formData: FormData) {
  const parsed = repairOutsourcingCancelSchema.safeParse({
    id: formData.get("id"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la anulacion.");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const previous = await (supabase as any)
    .from("repair_outsourcings")
    .select("id, status, notes, updated_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (previous.error || !previous.data) {
    redirectWithError(previous.error?.message ?? "No se encontro la terciarizacion.");
  }

  const payload = {
    status: "cancelado",
    notes: appendNote(previous.data.notes, emptyToNull(parsed.data.notes) ?? "Terciarizacion anulada."),
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  if (previous.data.status !== "en_taller") redirectWithError("Solo se puede anular una salida activa.");
  const { data: updated, error } = await (supabase as any)
    .from("repair_outsourcings")
    .update(payload)
    .eq("id", parsed.data.id).eq("status", "en_taller").eq("updated_at", previous.data.updated_at).select("id").maybeSingle();

  if (error) redirectWithError(error.message);
  if (!updated) redirectWithError("El registro cambio. Actualiza la pagina.");

  await createAuditLog({
    entityType: "repair_outsourcings",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: { previousStatus: previous.data.status, ...payload }
  });

  revalidatePath("/terciarizaciones");
  redirectWithStatus("outsourcing_cancelled", formData);
}

export async function updateRepairOutsourcingFollowupAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = repairOutsourcingFollowupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithError(parsed.error.issues[0]?.message ?? "Seguimiento invalido");
  const supabase = await createServerSupabaseClient();
  const { data: previous, error: readError } = await (supabase as any).from("repair_outsourcings")
    .select("id, status, notes, sent_at, updated_at").eq("id", parsed.data.id).maybeSingle();
  if (readError || !previous) redirectWithError(readError?.message ?? "No se encontro la salida");
  if (previous.status !== "en_taller") redirectWithError("El seguimiento de compromisos requiere una salida activa");
  if (parsed.data.promisedAt && parsed.data.promisedAt < previous.sent_at) redirectWithError("La promesa no puede ser anterior al envio");
  if (formData.get("expectedUpdatedAt") !== previous.updated_at) redirectWithError("El registro cambio. Actualiza la pagina");
  const payload = {
    responsible_name: parsed.data.responsibleName, promised_at: parsed.data.promisedAt,
    expected_cost: parsed.data.expectedCost,
    notes: appendNote(previous.notes, `Seguimiento ${new Date().toISOString()}: ${parsed.data.notes || "Compromisos actualizados."}`),
    updated_by: user.id, updated_at: new Date().toISOString()
  };
  const { data, error } = await (supabase as any).from("repair_outsourcings").update(payload)
    .eq("id", parsed.data.id).eq("updated_at", previous.updated_at).eq("status", "en_taller").select("id").maybeSingle();
  if (error || !data) redirectWithError(error?.message ?? "El registro cambio; no se guardo el seguimiento");
  await createAuditLog({ entityType: "repair_outsourcings", entityId: parsed.data.id, action: "update", userId: user.id, changes: payload });
  revalidatePath("/terciarizaciones");
  redirectWithStatus("outsourcing_updated", formData);
}

export async function recordRepairOutsourcingQualityAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = repairOutsourcingQualitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithError(parsed.error.issues[0]?.message ?? "Control invalido");
  const supabase = await createServerSupabaseClient();
  const { data: previous, error: readError } = await (supabase as any).from("repair_outsourcings")
    .select("id, status, notes, updated_at").eq("id", parsed.data.id).maybeSingle();
  if (readError || !previous) redirectWithError(readError?.message ?? "No se encontro la salida");
  if (previous.status !== "retirado") redirectWithError("Registra primero el retorno del equipo");
  if (formData.get("expectedUpdatedAt") !== previous.updated_at) redirectWithError("El registro cambio. Actualiza la pagina");
  const now = new Date().toISOString();
  const payload = { quality_status: parsed.data.qualityStatus, quality_notes: parsed.data.qualityNotes,
    quality_checked_at: now, quality_checked_by: user.id, updated_by: user.id, updated_at: now,
    notes: appendNote(previous.notes, `Control ${now} (${parsed.data.qualityStatus}): ${parsed.data.qualityNotes}`) };
  const { data, error } = await (supabase as any).from("repair_outsourcings").update(payload)
    .eq("id", parsed.data.id).eq("updated_at", previous.updated_at).eq("status", "retirado").select("id").maybeSingle();
  if (error || !data) redirectWithError(error?.message ?? "El registro cambio; no se guardo el control");
  await createAuditLog({ entityType: "repair_outsourcings", entityId: parsed.data.id, action: "update", userId: user.id, changes: payload });
  revalidatePath("/terciarizaciones");
  redirectWithStatus("outsourcing_quality_saved", formData);
}
