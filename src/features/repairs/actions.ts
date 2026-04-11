"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { repairStatusValues } from "@/features/repairs/schemas";

const repairFormSchema = z.object({
  id: z.string().uuid().optional(),
  customerName: z.string().min(1, "Ingresá el cliente"),
  device: z.string().min(1, "Ingresá el equipo"),
  issueDescription: z.string().min(1, "Ingresá la falla"),
  status: z.enum(repairStatusValues),
  amount: z.coerce.number().min(0, "Ingresá un monto válido"),
  paymentMethod: z.string().min(1, "Seleccioná un medio de pago"),
  observations: z.string().optional()
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/reparaciones?${params.toString()}`);
}

export async function saveRepairAction(formData: FormData) {
  const parsed = repairFormSchema.safeParse({
    id: formData.get("id") || undefined,
    customerName: formData.get("customerName"),
    device: formData.get("device"),
    issueDescription: formData.get("issueDescription"),
    status: formData.get("status"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    observations: formData.get("observations")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la reparación", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const payload = {
    customer_name: parsed.data.customerName,
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
    redirectWithError(error?.message ?? "No se pudo guardar la reparación", parsed.data.id);
  }

  await (supabase as any).from("repair_payments").delete().eq("repair_id", data.id);

  if (parsed.data.amount > 0) {
    const { error: paymentError } = await (supabase as any).from("repair_payments").insert({
      repair_id: data.id,
      payment_date: new Date().toISOString().slice(0, 10),
      method: parsed.data.paymentMethod,
      amount: parsed.data.amount,
      notes: parsed.data.observations || null
    });

    if (paymentError) redirectWithError(paymentError.message, data.id);
  }

  await createAuditLog({
    entityType: "repairs",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/reparaciones");
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
