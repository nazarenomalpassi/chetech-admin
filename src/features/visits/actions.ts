"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseVisitNotes, serializeVisitNotes, visitFormSchema, visitStatusSchema } from "@/features/visits/schemas";

function getSafeVisitsRedirectPath(value: FormDataEntryValue | null | undefined) {
  if (typeof value === "string" && value.startsWith("/visitas")) {
    return value;
  }

  return "/visitas";
}

function appendQuery(path: string, key: string, value: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, value);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function redirectWithError(message: string, returnTo?: FormDataEntryValue | null): never {
  redirect(appendQuery(getSafeVisitsRedirectPath(returnTo), "error", message) as Route);
}

function redirectWithStatus(status: string, returnTo?: FormDataEntryValue | null, receipt?: FormData): never {
  let path = appendQuery(getSafeVisitsRedirectPath(returnTo), "status", status);
  const token = receipt?.get("draftToken");
  const visitId = receipt?.get("draftVisitId");
  if (typeof token === "string" && z.string().uuid().safeParse(token).success && typeof visitId === "string") {
    path = appendQuery(appendQuery(path, "savedDraftToken", token), "savedDraftVisitId", visitId);
  }
  redirect(path as Route);
}

export async function saveVisitAction(formData: FormData) {
  const parsed = visitFormSchema.safeParse({
    id: formData.get("id") || undefined,
    expectedUpdatedAt: formData.get("expectedUpdatedAt") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    address: formData.get("address"),
    visitDate: formData.get("visitDate"),
    timeFrom: formData.get("timeFrom"),
    timeTo: formData.get("timeTo"),
    technicianId: formData.get("technicianId"),
    repairAccessOrderId: formData.get("repairAccessOrderId"),
    reason: formData.get("reason"),
    notes: formData.get("notes") ?? undefined,
    toolsRequired: formData.get("toolsRequired") ?? undefined,
    toolsDetail: formData.get("toolsDetail") ?? undefined,
    status: formData.get("status") || undefined
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la visita", formData.get("returnTo"));
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const draftOperation = z.string().uuid().safeParse(formData.get("draftToken"));
  const operationId = !parsed.data.id && draftOperation.success ? draftOperation.data : null;
  if (operationId) {
    const { data: existing, error } = await (supabase as any).from("visits").select("id")
      .eq("client_operation_id", operationId).eq("created_by", user.id).maybeSingle();
    if (error) redirectWithError("No se pudo comprobar el borrador. Verifica la migracion incremental y reintenta.", formData.get("returnTo"));
    if (existing) redirectWithStatus("visit_already_created", formData.get("returnTo"), formData);
  }
  const repairNumberEntry = formData.get("repairNumber");
  let repairAccessOrderId = parsed.data.repairAccessOrderId;
  if (typeof repairNumberEntry === "string" && repairNumberEntry.trim()) {
    const match = repairNumberEntry.trim().toUpperCase().match(/^(?:REP[\s-]*)?(\d+)$/);
    if (!match) redirectWithError("Ingresa una REP valida", formData.get("returnTo"));
    const { data: order, error } = await (supabase as any).from("repair_access_orders")
      .select("id").eq("repair_number", `REP-${match[1].padStart(6, "0")}`).maybeSingle();
    if (error || !order) redirectWithError("No se encontro la REP indicada", formData.get("returnTo"));
    repairAccessOrderId = order.id;
  } else if (repairNumberEntry !== null) {
    repairAccessOrderId = null;
  }
  let technicianName: string | null = null;
  if (parsed.data.technicianId) {
    const { data: technician, error } = await (supabase as any).from("profiles")
      .select("id, full_name, role").eq("id", parsed.data.technicianId).maybeSingle();
    if (error || !technician || !["admin", "tecnico"].includes(technician.role)) {
      redirectWithError("Selecciona un tecnico valido del local", formData.get("returnTo"));
    }
    technicianName = technician.full_name;
  }
  let notes = parsed.data.notes;
  if (formData.has("toolsRequired")) {
    if (parsed.data.id && notes === undefined) {
      const existing = await (supabase as any).from("visits").select("notes").eq("id", parsed.data.id).eq("updated_at", parsed.data.expectedUpdatedAt).maybeSingle();
      if (existing.error || !existing.data) redirectWithError("La visita cambio. Revisa el borrador antes de guardar las herramientas.", formData.get("returnTo"));
      notes = parseVisitNotes(existing.data.notes ?? "").notes;
    }
    notes = serializeVisitNotes({ notes: notes ?? "", toolsRequired: parsed.data.toolsRequired, toolsDetail: parsed.data.toolsDetail });
    if (notes.length > 2000) redirectWithError("Las observaciones y herramientas superan 2000 caracteres. No se guardaron cambios.", formData.get("returnTo"));
  }
  const payload = {
    customer_name: parsed.data.customerName,
    customer_phone: parsed.data.customerPhone,
    address: parsed.data.address,
    visit_date: parsed.data.visitDate,
    time_from: parsed.data.timeFrom,
    time_to: parsed.data.timeTo,
    ...(!parsed.data.id || formData.has("technicianId") ? { technician_id: parsed.data.technicianId, technician_name: technicianName } : {}),
    ...(!parsed.data.id || formData.has("repairNumber") || formData.has("repairAccessOrderId") ? { repair_access_order_id: repairAccessOrderId } : {}),
    reason: parsed.data.reason,
    ...(notes !== undefined || !parsed.data.id ? { notes: notes || null } : {}),
    ...(!parsed.data.id ? { status: "pendiente" } : formData.has("status") ? { status: parsed.data.status } : {}),
    ...(!parsed.data.id ? { created_by: user.id } : {}),
    ...(operationId ? { client_operation_id: operationId } : {}),
    updated_at: new Date().toISOString()
  };

  const { data, error } = parsed.data.id
    ? await (supabase as any).from("visits").update(payload).eq("id", parsed.data.id).eq("updated_at", parsed.data.expectedUpdatedAt).select("id").single()
    : await (supabase as any).from("visits").insert(payload).select("id").single();

  if (error || !data) {
    if (error?.code === "23505" && operationId) {
      const retry = await (supabase as any).from("visits").select("id").eq("client_operation_id", operationId).eq("created_by", user.id).maybeSingle();
      if (retry.data) redirectWithStatus("visit_already_created", formData.get("returnTo"), formData);
    }
    const message =
      error?.code === "23P01"
        ? "La asignacion existente se superpone con otra visita. Elegi otro horario."
        : error?.code === "42P01" || error?.code === "42703"
        ? "Falta ejecutar la migracion de Visitas en Supabase antes de usar este modulo."
        : error?.code === "PGRST116" ? "La visita cambio. No se sobrescribio; recupera y revisa el borrador local."
        : error?.message ?? "No se pudo guardar la visita";
    redirectWithError(message, formData.get("returnTo"));
  }

  await createAuditLog({
    entityType: "visits",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/visitas");
  revalidatePath("/dashboard");
  redirectWithStatus(parsed.data.id ? "visit_updated" : "visit_created", formData.get("returnTo"), formData);
}

export async function updateVisitStatusAction(formData: FormData) {
  const notesEntry = formData.get("notes");
  const parsed = visitStatusSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt") || undefined,
    status: formData.get("status"),
    notes: typeof notesEntry === "string" ? notesEntry : undefined
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo actualizar el estado", formData.get("returnTo"));
  }

  const user = await requirePermission("visits.update");
  const supabase = await createServerSupabaseClient();
  let notes = parsed.data.notes;
  let expectedUpdatedAt = parsed.data.expectedUpdatedAt;
  if (notes !== undefined) {
    let savedQuery = (supabase as any).from("visits").select("notes, updated_at").eq("id", parsed.data.id);
    if (expectedUpdatedAt) savedQuery = savedQuery.eq("updated_at", expectedUpdatedAt);
    const saved = await savedQuery.maybeSingle();
    if (saved.error || !saved.data) redirectWithError("La visita cambio o no se pudo leer. No se sobrescribieron las observaciones ni las herramientas.", formData.get("returnTo"));
    expectedUpdatedAt ??= saved.data.updated_at;
    if (!expectedUpdatedAt) redirectWithError("Actualiza la visita antes de editar las observaciones.", formData.get("returnTo"));
    // Status/notes editors cannot replace the saved tool checklist, including old raw drafts.
    notes = serializeVisitNotes({ ...parseVisitNotes(saved.data.notes ?? ""), notes: parseVisitNotes(notes).notes });
    if (notes.length > 2000) redirectWithError("Las observaciones y herramientas superan 2000 caracteres. No se guardaron cambios.", formData.get("returnTo"));
  }
  const payload = {
    status: parsed.data.status,
    ...(notes !== undefined
      ? { notes: notes || null }
      : {}),
    updated_at: new Date().toISOString()
  };
  let query = (supabase as any)
    .from("visits")
    .update(payload)
    .eq("id", parsed.data.id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data: updated, error } = await query.select("id").single();

  if (error || !updated) {
    const message =
      error?.code === "23P01"
        ? "No se puede reabrir: el tecnico tiene otra visita en ese horario."
        : error?.code === "42P01"
        ? "Falta ejecutar la migracion de Visitas en Supabase antes de usar este modulo."
        : error?.message ?? "La visita no existe o no tenes acceso";
    redirectWithError(message, formData.get("returnTo"));
  }

  await createAuditLog({
    entityType: "visits",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/visitas");
  revalidatePath("/dashboard");
  redirectWithStatus("visit_status_updated", formData.get("returnTo"), formData);
}

export async function deleteVisitAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  // Cancellation keeps the original customer, schedule and business history.
  const { error } = await (supabase as any).from("visits").update({ status: "cancelada" }).eq("id", id).select("id").single();

  if (error) {
    const message =
      error.code === "42P01"
        ? "Falta ejecutar la migracion de Visitas en Supabase antes de usar este modulo."
        : error.message;
    redirectWithError(message, formData.get("returnTo"));
  }

  await createAuditLog({
    entityType: "visits",
    entityId: id,
    action: "update",
    userId: user.id,
    changes: { status: "cancelada", reason: "Cancelacion administrativa; historial conservado" }
  });

  revalidatePath("/visitas");
  revalidatePath("/dashboard");
  redirectWithStatus("visit_cancelled", formData.get("returnTo"));
}
