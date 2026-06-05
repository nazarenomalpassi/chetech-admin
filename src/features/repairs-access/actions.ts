"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { normalizeRepairAccessLookup } from "@/features/repairs-access/customer-search";
import { repairAccessIntakeSchema, repairAccessTechnicalSchema } from "@/features/repairs-access/schemas";
import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("order", id);
  redirect(`/reparaciones-access?${params.toString()}` as Route);
}

function emptyToNull(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function optionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function normalizePhone(value?: string | null) {
  const text = emptyToNull(value);
  if (!text) return null;

  const digits = text.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
}

async function getNextRepairNumber(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data, error } = await (supabase as any).rpc("generate_repair_access_number");
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo generar el numero de orden.");
  }

  return String(data);
}

async function insertStatusHistory({
  supabase,
  repairOrderId,
  previousStatus,
  nextStatus,
  userId,
  notes
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  repairOrderId: string;
  previousStatus: string | null;
  nextStatus: string;
  userId: string;
  notes?: string | null;
}) {
  if (previousStatus === nextStatus) return;

  await (supabase as any)
    .from("repair_access_status_history")
    .insert({
      repair_order_id: repairOrderId,
      previous_status: previousStatus,
      next_status: nextStatus,
      changed_by: userId,
      notes: emptyToNull(notes)
    });
}

export async function saveRepairAccessOrderAction(formData: FormData) {
  const parsed = repairAccessIntakeSchema.safeParse({
    id: formData.get("id") || undefined,
    customerId: formData.get("customerId") || undefined,
    deviceId: formData.get("deviceId") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    customerAlternatePhone: formData.get("customerAlternatePhone"),
    customerDni: formData.get("customerDni"),
    customerEmail: formData.get("customerEmail"),
    customerAddress: formData.get("customerAddress"),
    customerNotes: formData.get("customerNotes"),
    deviceType: formData.get("deviceType"),
    deviceBrand: formData.get("deviceBrand"),
    deviceModel: formData.get("deviceModel"),
    serialNumber: formData.get("serialNumber"),
    accessoryDetails: formData.get("accessoryDetails"),
    visualCondition: formData.get("visualCondition"),
    intakeDate: formData.get("intakeDate"),
    issueReported: formData.get("issueReported"),
    priority: formData.get("priority"),
    notes: formData.get("notes"),
    status: formData.get("status")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la orden.", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const customerPayload = {
    full_name: parsed.data.customerName,
    full_name_normalized: normalizeRepairAccessLookup(parsed.data.customerName),
    phone: emptyToNull(parsed.data.customerPhone),
    phone_normalized: normalizePhone(parsed.data.customerPhone),
    alternate_phone: emptyToNull(parsed.data.customerAlternatePhone),
    alternate_phone_normalized: normalizePhone(parsed.data.customerAlternatePhone),
    dni: emptyToNull(parsed.data.customerDni),
    email: emptyToNull(parsed.data.customerEmail),
    address: emptyToNull(parsed.data.customerAddress),
    notes: emptyToNull(parsed.data.customerNotes),
    source: parsed.data.customerId ? undefined : "manual",
    created_by: user.id,
    updated_at: new Date().toISOString()
  };

  const customerOperation = parsed.data.customerId
    ? await (supabase as any).from("repair_access_customers").update(customerPayload).eq("id", parsed.data.customerId).select("id").single()
    : await (supabase as any).from("repair_access_customers").insert(customerPayload).select("id").single();

  if (customerOperation.error || !customerOperation.data) {
    redirectWithError(customerOperation.error?.message ?? "No se pudo guardar el cliente.", parsed.data.id);
  }

  const devicePayload = {
    customer_id: customerOperation.data.id,
    device_type: parsed.data.deviceType,
    brand: emptyToNull(parsed.data.deviceBrand),
    model: emptyToNull(parsed.data.deviceModel),
    serial_number: emptyToNull(parsed.data.serialNumber),
    accessory_details: emptyToNull(parsed.data.accessoryDetails),
    visual_condition: emptyToNull(parsed.data.visualCondition),
    created_by: user.id,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  const deviceOperation = parsed.data.deviceId
    ? await (supabase as any).from("repair_access_devices").update(devicePayload).eq("id", parsed.data.deviceId).select("id").single()
    : await (supabase as any).from("repair_access_devices").insert(devicePayload).select("id").single();

  if (deviceOperation.error || !deviceOperation.data) {
    redirectWithError(deviceOperation.error?.message ?? "No se pudo guardar el equipo.", parsed.data.id);
  }

  const previousOrder = parsed.data.id
    ? await (supabase as any)
        .from("repair_access_orders")
        .select("id, status, repair_number")
        .eq("id", parsed.data.id)
        .maybeSingle()
    : null;

  if (previousOrder?.error) {
    redirectWithError(previousOrder.error.message, parsed.data.id);
  }

  let repairNumber = previousOrder?.data?.repair_number ?? null;
  if (!repairNumber) {
    try {
      repairNumber = await getNextRepairNumber(supabase);
    } catch (error) {
      redirectWithError(error instanceof Error ? error.message : "No se pudo generar el numero de orden.", parsed.data.id);
    }
  }

  const orderPayload = {
    repair_number: repairNumber,
    customer_id: customerOperation.data.id,
    device_id: deviceOperation.data.id,
    intake_date: parsed.data.intakeDate,
    issue_reported: parsed.data.issueReported,
    notes: emptyToNull(parsed.data.notes),
    priority: emptyToNull(parsed.data.priority),
    status: parsed.data.status,
    created_by: user.id,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  const orderOperation = parsed.data.id
    ? await (supabase as any).from("repair_access_orders").update(orderPayload).eq("id", parsed.data.id).select("id, status, repair_number").single()
    : await (supabase as any).from("repair_access_orders").insert(orderPayload).select("id, status, repair_number").single();

  if (orderOperation.error || !orderOperation.data) {
    redirectWithError(orderOperation.error?.message ?? "No se pudo guardar la orden.", parsed.data.id);
  }

  await insertStatusHistory({
    supabase,
    repairOrderId: orderOperation.data.id,
    previousStatus: previousOrder?.data?.status ?? null,
    nextStatus: parsed.data.status,
    userId: user.id,
    notes: parsed.data.notes
  });

  await createAuditLog({
    entityType: "repair_access_orders",
    entityId: orderOperation.data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: orderPayload
  });

  revalidatePath("/reparaciones-access");
  redirect(`/reparaciones-access?status=${parsed.data.id ? "repair_access_updated" : "repair_access_created"}` as Route);
}

export async function updateRepairAccessTechnicalAction(formData: FormData) {
  const parsed = repairAccessTechnicalSchema.safeParse({
    id: formData.get("id"),
    technicianName: optionalFormString(formData, "technicianName"),
    technicalDiagnosis: optionalFormString(formData, "technicalDiagnosis"),
    repairProgress: optionalFormString(formData, "repairProgress"),
    internalObservations: optionalFormString(formData, "internalObservations"),
    usedParts: optionalFormString(formData, "usedParts"),
    workPerformed: optionalFormString(formData, "workPerformed"),
    budgetAmount: formData.get("budgetAmount") || 0,
    budgetDetail: optionalFormString(formData, "budgetDetail"),
    budgetResponseNotes: optionalFormString(formData, "budgetResponseNotes"),
    finalAmount: formData.get("finalAmount") || 0,
    paymentMethod: optionalFormString(formData, "paymentMethod"),
    paymentNotes: optionalFormString(formData, "paymentNotes"),
    warrantyDays: formData.get("warrantyDays") || 0,
    warrantyUntil: optionalFormString(formData, "warrantyUntil"),
    warrantyConditions: optionalFormString(formData, "warrantyConditions"),
    status: formData.get("status"),
    isPaid: formData.get("isPaid") === "on"
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el seguimiento tecnico.", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const previousOrder = await (supabase as any)
    .from("repair_access_orders")
    .select("id, status, is_paid, paid_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (previousOrder.error || !previousOrder.data) {
    redirectWithError(previousOrder.error?.message ?? "No se encontro la orden.", parsed.data.id);
  }

  const now = new Date().toISOString();
  const budgetAmount = parsed.data.budgetAmount || 0;
  const finalAmount = parsed.data.finalAmount || budgetAmount;
  const isBudgetResponseStatus = ["presupuestado_aceptado", "presupuestado_rechazado"].includes(parsed.data.status);
  const isReadyOrClosed = ["listo_para_retirar", "retirado"].includes(parsed.data.status);

  const orderPayload = {
    technician_name: emptyToNull(parsed.data.technicianName),
    technical_diagnosis: emptyToNull(parsed.data.technicalDiagnosis),
    repair_progress: emptyToNull(parsed.data.repairProgress),
    internal_observations: emptyToNull(parsed.data.internalObservations),
    used_parts: emptyToNull(parsed.data.usedParts),
    work_performed: emptyToNull(parsed.data.workPerformed),
    budget_amount: budgetAmount,
    budget_detail: emptyToNull(parsed.data.budgetDetail),
    budget_response_notes: emptyToNull(parsed.data.budgetResponseNotes),
    budget_response_at: isBudgetResponseStatus ? now : null,
    budgeted_at: budgetAmount > 0 ? now : null,
    final_amount: finalAmount,
    payment_method: emptyToNull(parsed.data.paymentMethod),
    payment_notes: emptyToNull(parsed.data.paymentNotes),
    is_paid: parsed.data.isPaid,
    paid_at: parsed.data.isPaid ? previousOrder.data.paid_at ?? now : null,
    finished_at: isReadyOrClosed ? now : null,
    warranty_days: parsed.data.warrantyDays || 0,
    warranty_conditions: emptyToNull(parsed.data.warrantyConditions),
    status: parsed.data.status,
    updated_by: user.id,
    updated_at: now
  };

  const orderOperation = await (supabase as any)
    .from("repair_access_orders")
    .update(orderPayload)
    .eq("id", parsed.data.id)
    .select("id")
    .single();

  if (orderOperation.error || !orderOperation.data) {
    redirectWithError(orderOperation.error?.message ?? "No se pudo actualizar la orden.", parsed.data.id);
  }

  await insertStatusHistory({
    supabase,
    repairOrderId: parsed.data.id,
    previousStatus: previousOrder.data.status,
    nextStatus: parsed.data.status,
    userId: user.id,
    notes: parsed.data.budgetResponseNotes || parsed.data.internalObservations
  });

  await createAuditLog({
    entityType: "repair_access_orders",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: orderPayload
  });

  revalidatePath("/reparaciones-access");
  redirect(`/reparaciones-access?status=repair_access_updated&order=${parsed.data.id}` as Route);
}

export async function cancelRepairAccessOrderAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const previousOrder = await (supabase as any)
    .from("repair_access_orders")
    .select("id, status, notes, is_paid")
    .eq("id", id)
    .maybeSingle();

  if (previousOrder.error || !previousOrder.data) {
    redirectWithError(previousOrder.error?.message ?? "No se encontro la orden.", id);
  }

  if (previousOrder.data.is_paid) {
    redirectWithError("La orden ya esta cobrada. Primero reverti el cobro desde Pagos de reparaciones para no desincronizar caja.", id);
  }

  const now = new Date().toISOString();
  const cancellationNote = `Orden anulada desde Reparaciones el ${now.slice(0, 10)}.`;
  const notes = [emptyToNull(previousOrder.data.notes), cancellationNote].filter(Boolean).join("\n\n");

  const { error } = await (supabase as any)
    .from("repair_access_orders")
    .update({
      status: "sin_solucion",
      notes,
      updated_by: user.id,
      updated_at: now
    })
    .eq("id", id);
  if (error) redirectWithError(error.message);

  await insertStatusHistory({
    supabase,
    repairOrderId: id,
    previousStatus: previousOrder.data.status,
    nextStatus: "sin_solucion",
    userId: user.id,
    notes: cancellationNote
  });

  await createAuditLog({
    entityType: "repair_access_orders",
    entityId: id,
    action: "update",
    userId: user.id,
    changes: { status: "sin_solucion", notes }
  });

  revalidatePath("/reparaciones-access");
  redirect("/reparaciones-access?status=repair_access_cancelled" as Route);
}
