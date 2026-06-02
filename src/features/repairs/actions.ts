"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { repairStatusValues } from "@/features/repairs/schemas";
import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const repairFormSchema = z.object({
  id: z.string().uuid().optional(),
  repairAccessOrderId: z.string().uuid().optional(),
  customerName: z.string().min(1, "Ingresa el cliente"),
  customerPhone: z.string().optional(),
  device: z.string().min(1, "Ingresa el equipo"),
  issueDescription: z.string().min(1, "Ingresa la falla"),
  status: z.enum(repairStatusValues),
  amount: z.coerce.number().min(0, "Ingresa un monto valido"),
  paymentMethod: z.string().min(1, "Selecciona un medio de pago"),
  observations: z.string().optional()
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/reparaciones?${params.toString()}`);
}

function addDaysToDate(date: string, days: number) {
  if (days <= 0) return null;

  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

async function markAccessOrderAsRetired({
  supabase,
  repairId,
  repairAccessOrderId,
  amount,
  paymentMethod,
  paymentNotes,
  userId
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  repairId: string;
  repairAccessOrderId: string;
  amount: number;
  paymentMethod: string;
  paymentNotes: string | null;
  userId: string;
}) {
  const previousAccessOrder = await (supabase as any)
    .from("repair_access_orders")
    .select("id, status, warranty_days")
    .eq("id", repairAccessOrderId)
    .maybeSingle();

  if (previousAccessOrder.error || !previousAccessOrder.data) {
    redirectWithError(previousAccessOrder.error?.message ?? "No se encontro la orden Access vinculada.", repairId);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const warrantyDays = Number(previousAccessOrder.data.warranty_days ?? 0);
  const warrantyUntil = addDaysToDate(today, warrantyDays);
  const accessPayload = {
    status: "retirado",
    final_amount: amount,
    payment_method: paymentMethod,
    payment_notes: paymentNotes,
    is_paid: true,
    paid_at: nowIso,
    picked_up_at: nowIso,
    delivered_at: nowIso,
    warranty_start: warrantyDays > 0 ? today : null,
    warranty_until: warrantyUntil,
    warranty_active: Boolean(warrantyUntil),
    updated_by: userId,
    updated_at: nowIso
  };

  const { error: accessUpdateError } = await (supabase as any)
    .from("repair_access_orders")
    .update(accessPayload)
    .eq("id", repairAccessOrderId);

  if (accessUpdateError) redirectWithError(accessUpdateError.message, repairId);

  if (previousAccessOrder.data.status !== "retirado") {
    await (supabase as any)
      .from("repair_access_status_history")
      .insert({
        repair_order_id: repairAccessOrderId,
        previous_status: previousAccessOrder.data.status,
        next_status: "retirado",
        changed_by: userId,
        notes: `Facturada desde Reparaciones (${repairId})`
      });
  }
}

export async function saveRepairAction(formData: FormData) {
  const parsed = repairFormSchema.safeParse({
    id: formData.get("id") || undefined,
    repairAccessOrderId: formData.get("repairAccessOrderId") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    device: formData.get("device"),
    issueDescription: formData.get("issueDescription"),
    status: formData.get("status"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    observations: formData.get("observations")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la reparacion", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const payload = {
    repair_access_order_id: parsed.data.repairAccessOrderId ?? null,
    customer_name: parsed.data.customerName,
    customer_phone: parsed.data.customerPhone || null,
    device: parsed.data.device,
    issue_description: parsed.data.issueDescription,
    status: parsed.data.status,
    estimated_price: parsed.data.amount,
    final_price: parsed.data.amount,
    observations: parsed.data.observations || null,
    created_by: user.id,
    updated_at: new Date().toISOString()
  };

  const { data, error } = parsed.data.id
    ? await (supabase as any).from("repairs").update(payload).eq("id", parsed.data.id).select("id").single()
    : await (supabase as any).from("repairs").insert(payload).select("id").single();

  if (error || !data) {
    redirectWithError(error?.message ?? "No se pudo guardar la reparacion", parsed.data.id);
  }

  await (supabase as any).from("repair_payments").delete().eq("repair_id", data.id);

  if (parsed.data.amount > 0) {
    const paymentNotes = parsed.data.observations || null;
    const { error: paymentError } = await (supabase as any).from("repair_payments").insert({
      repair_id: data.id,
      payment_date: new Date().toISOString().slice(0, 10),
      method: parsed.data.paymentMethod,
      amount: parsed.data.amount,
      notes: paymentNotes
    });

    if (paymentError) redirectWithError(paymentError.message, data.id);

    if (parsed.data.repairAccessOrderId) {
      await markAccessOrderAsRetired({
        supabase,
        repairId: data.id,
        repairAccessOrderId: parsed.data.repairAccessOrderId,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        paymentNotes,
        userId: user.id
      });
    }
  }

  await createAuditLog({
    entityType: "repairs",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/reparaciones");
  revalidatePath("/reparaciones-access");
  revalidatePath("/dashboard");
  redirect(`/reparaciones?status=${parsed.data.id ? "repair_updated" : "repair_created"}`);
}

export async function deleteRepairAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from("repairs").delete().eq("id", id);

  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "repairs", entityId: id, action: "delete", userId: user.id });
  revalidatePath("/reparaciones");
  revalidatePath("/dashboard");
  redirect("/reparaciones?status=repair_deleted");
}
