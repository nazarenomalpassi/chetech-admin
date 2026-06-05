"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  repairOutsourcingCancelSchema,
  repairOutsourcingRetrievedSchema,
  repairOutsourcingSchema
} from "@/features/outsourcings/schemas";
import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/terciarizaciones?${params.toString()}` as Route);
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
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la terciarizacion.");
  }

  const user = await requireUser();
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
  redirect("/terciarizaciones?status=outsourcing_created" as Route);
}

export async function markRepairOutsourcingRetrievedAction(formData: FormData) {
  const parsed = repairOutsourcingRetrievedSchema.safeParse({
    id: formData.get("id"),
    retrievedAt: formData.get("retrievedAt"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el retiro.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const previous = await (supabase as any)
    .from("repair_outsourcings")
    .select("id, status, notes")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (previous.error || !previous.data) {
    redirectWithError(previous.error?.message ?? "No se encontro la terciarizacion.");
  }

  const retrievedNote = [
    `Equipo buscado del taller externo el ${parsed.data.retrievedAt}.`,
    emptyToNull(parsed.data.notes)
  ].filter(Boolean).join(" ");

  const payload = {
    status: "retirado",
    retrieved_at: parsed.data.retrievedAt,
    notes: appendNote(previous.data.notes, retrievedNote),
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  const { error } = await (supabase as any)
    .from("repair_outsourcings")
    .update(payload)
    .eq("id", parsed.data.id);

  if (error) redirectWithError(error.message);

  await createAuditLog({
    entityType: "repair_outsourcings",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: { previousStatus: previous.data.status, ...payload }
  });

  revalidatePath("/terciarizaciones");
  redirect("/terciarizaciones?status=outsourcing_retrieved" as Route);
}

export async function cancelRepairOutsourcingAction(formData: FormData) {
  const parsed = repairOutsourcingCancelSchema.safeParse({
    id: formData.get("id"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la anulacion.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const previous = await (supabase as any)
    .from("repair_outsourcings")
    .select("id, status, notes")
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

  const { error } = await (supabase as any)
    .from("repair_outsourcings")
    .update(payload)
    .eq("id", parsed.data.id);

  if (error) redirectWithError(error.message);

  await createAuditLog({
    entityType: "repair_outsourcings",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: { previousStatus: previous.data.status, ...payload }
  });

  revalidatePath("/terciarizaciones");
  redirect("/terciarizaciones?status=outsourcing_cancelled" as Route);
}
