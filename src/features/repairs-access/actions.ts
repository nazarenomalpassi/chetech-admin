"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { repairAccessOrderSchema } from "@/features/repairs-access/schemas";

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/reparaciones-access?${params.toString()}`);
}

function emptyToNull(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizePhone(value?: string | null) {
  const text = emptyToNull(value);
  if (!text) return null;

  const digits = text.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
}

export async function saveRepairAccessOrderAction(formData: FormData) {
  const parsed = repairAccessOrderSchema.safeParse({
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
    technicalDiagnosis: formData.get("technicalDiagnosis"),
    workPerformed: formData.get("workPerformed"),
    usedParts: formData.get("usedParts"),
    internalObservations: formData.get("internalObservations"),
    budgetAmount: formData.get("budgetAmount") || 0,
    approvedAmount: formData.get("approvedAmount") || 0,
    finalAmount: formData.get("finalAmount") || 0,
    paymentMethod: formData.get("paymentMethod"),
    paymentNotes: formData.get("paymentNotes"),
    warrantyDays: formData.get("warrantyDays") || 0,
    warrantyUntil: formData.get("warrantyUntil"),
    warrantyConditions: formData.get("warrantyConditions"),
    priority: formData.get("priority"),
    notes: formData.get("notes"),
    status: formData.get("status"),
    isPaid: formData.get("isPaid") === "on"
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la orden.", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const customerPayload = {
    full_name: parsed.data.customerName,
    phone: emptyToNull(parsed.data.customerPhone),
    phone_normalized: normalizePhone(parsed.data.customerPhone),
    alternate_phone: emptyToNull(parsed.data.customerAlternatePhone),
    alternate_phone_normalized: normalizePhone(parsed.data.customerAlternatePhone),
    dni: emptyToNull(parsed.data.customerDni),
    email: emptyToNull(parsed.data.customerEmail),
    address: emptyToNull(parsed.data.customerAddress),
    notes: emptyToNull(parsed.data.customerNotes),
    source: "manual",
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
    notes: emptyToNull(parsed.data.customerNotes),
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

  const orderPayload = {
    customer_id: customerOperation.data.id,
    device_id: deviceOperation.data.id,
    intake_date: parsed.data.intakeDate,
    issue_reported: parsed.data.issueReported,
    technical_diagnosis: emptyToNull(parsed.data.technicalDiagnosis),
    work_performed: emptyToNull(parsed.data.workPerformed),
    used_parts: emptyToNull(parsed.data.usedParts),
    internal_observations: emptyToNull(parsed.data.internalObservations),
    budget_amount: parsed.data.budgetAmount || 0,
    approved_amount: parsed.data.approvedAmount || 0,
    final_amount: parsed.data.finalAmount || 0,
    payment_method: parsed.data.paymentMethod,
    payment_notes: emptyToNull(parsed.data.paymentNotes),
    is_paid: parsed.data.isPaid,
    paid_at: parsed.data.isPaid ? new Date().toISOString() : null,
    warranty_days: parsed.data.warrantyDays || 0,
    warranty_until: emptyToNull(parsed.data.warrantyUntil),
    warranty_conditions: emptyToNull(parsed.data.warrantyConditions),
    warranty_active: Boolean(parsed.data.warrantyUntil),
    notes: emptyToNull(parsed.data.notes),
    priority: emptyToNull(parsed.data.priority),
    status: parsed.data.status,
    created_by: user.id,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  };

  const orderOperation = parsed.data.id
    ? await (supabase as any).from("repair_access_orders").update(orderPayload).eq("id", parsed.data.id).select("id, status").single()
    : await (supabase as any).from("repair_access_orders").insert(orderPayload).select("id, status").single();

  if (orderOperation.error || !orderOperation.data) {
    redirectWithError(orderOperation.error?.message ?? "No se pudo guardar la orden.", parsed.data.id);
  }

  await (supabase as any)
    .from("repair_access_status_history")
    .insert({
      repair_order_id: orderOperation.data.id,
      previous_status: null,
      next_status: parsed.data.status,
      changed_by: user.id,
      notes: emptyToNull(parsed.data.notes)
    });

  await createAuditLog({
    entityType: "repair_access_orders",
    entityId: orderOperation.data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: orderPayload
  });

  revalidatePath("/reparaciones-access");
  redirect(`/reparaciones-access?status=${parsed.data.id ? "repair_access_updated" : "repair_access_created"}`);
}

export async function deleteRepairAccessOrderAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { error } = await (supabase as any).from("repair_access_orders").delete().eq("id", id);
  if (error) redirectWithError(error.message);

  await createAuditLog({
    entityType: "repair_access_orders",
    entityId: id,
    action: "delete",
    userId: user.id
  });

  revalidatePath("/reparaciones-access");
  redirect("/reparaciones-access?status=repair_access_deleted");
}
