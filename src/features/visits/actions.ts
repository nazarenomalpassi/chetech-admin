"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { visitFormSchema, visitStatusSchema } from "@/features/visits/schemas";

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

function redirectWithStatus(status: string, returnTo?: FormDataEntryValue | null): never {
  redirect(appendQuery(getSafeVisitsRedirectPath(returnTo), "status", status) as Route);
}

export async function saveVisitAction(formData: FormData) {
  const parsed = visitFormSchema.safeParse({
    id: formData.get("id") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    address: formData.get("address"),
    visitDate: formData.get("visitDate"),
    timeFrom: formData.get("timeFrom"),
    timeTo: formData.get("timeTo"),
    reason: formData.get("reason"),
    notes: formData.get("notes"),
    status: formData.get("status") || undefined
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la visita", formData.get("returnTo"));
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const payload = {
    customer_name: parsed.data.customerName,
    customer_phone: parsed.data.customerPhone,
    address: parsed.data.address,
    visit_date: parsed.data.visitDate,
    time_from: parsed.data.timeFrom,
    time_to: parsed.data.timeTo,
    reason: parsed.data.reason,
    notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
    status: parsed.data.status,
    created_by: user.id,
    updated_at: new Date().toISOString()
  };

  const { data, error } = parsed.data.id
    ? await (supabase as any).from("visits").update(payload).eq("id", parsed.data.id).select("id").single()
    : await (supabase as any).from("visits").insert(payload).select("id").single();

  if (error || !data) {
    const message =
      error?.code === "42P01"
        ? "Falta ejecutar la migracion de Visitas en Supabase antes de usar este modulo."
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
  redirectWithStatus(parsed.data.id ? "visit_updated" : "visit_created", formData.get("returnTo"));
}

export async function updateVisitStatusAction(formData: FormData) {
  const notesEntry = formData.get("notes");
  const parsed = visitStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    notes: typeof notesEntry === "string" ? notesEntry : undefined
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo actualizar el estado", formData.get("returnTo"));
  }

  const user = await requirePermission("visits.update");
  const supabase = await createServerSupabaseClient();
  const payload = {
    status: parsed.data.status,
    ...(parsed.data.notes !== undefined
      ? { notes: parsed.data.notes.trim() || null }
      : {}),
    updated_at: new Date().toISOString()
  };
  const { error } = await (supabase as any)
    .from("visits")
    .update(payload)
    .eq("id", parsed.data.id);

  if (error) {
    const message =
      error.code === "42P01"
        ? "Falta ejecutar la migracion de Visitas en Supabase antes de usar este modulo."
        : error.message;
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
  redirectWithStatus("visit_status_updated", formData.get("returnTo"));
}

export async function deleteVisitAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from("visits").delete().eq("id", id);

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
    action: "delete",
    userId: user.id
  });

  revalidatePath("/visitas");
  revalidatePath("/dashboard");
  redirectWithStatus("visit_deleted", formData.get("returnTo"));
}
