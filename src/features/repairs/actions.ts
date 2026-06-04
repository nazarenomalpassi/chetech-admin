"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement, replaceCashMovements } from "@/lib/accounting";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getPaymentTotal, parsePaymentSplits } from "@/lib/payment-splits";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toOperationalDateTime } from "@/lib/utils";
import { getRepairValidationError } from "@/features/repairs/validation";

const repairFormSchema = z.object({
  id: z.string().uuid().optional(),
  customerName: z.string().min(1, "Ingresa el cliente"),
  device: z.string().min(1, "Ingresa el equipo"),
  orderNumber: z.string().trim().optional(),
  entryDate: z.string().min(1, "Selecciona la fecha de ingreso"),
  amount: z.coerce.number().min(0, "Ingresa un monto valido"),
  payments: z.array(
    z.object({
      method: z.string().min(1, "Selecciona un medio de pago"),
      amount: z.coerce.number().positive("Ingresa un monto valido para cada pago")
    })
  )
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/reparaciones?${params.toString()}`);
}

async function findOrCreateClient(supabase: any, name: string) {
  const customerName = name.trim();
  if (!customerName) return null;

  const existing = await supabase
    .from("clientes")
    .select("id")
    .ilike("nombre", customerName)
    .maybeSingle();

  if (existing.error?.code === "42P01") return null;
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id;

  const created = await supabase
    .from("clientes")
    .insert({ nombre: customerName })
    .select("id")
    .single();

  if (created.error?.code === "42P01") return null;
  if (created.error) throw created.error;
  return created.data?.id ?? null;
}

export async function saveRepairAction(formData: FormData) {
  const parsed = repairFormSchema.safeParse({
    id: formData.get("id") || undefined,
    customerName: formData.get("customerName"),
    device: formData.get("device"),
    orderNumber: formData.get("orderNumber"),
    entryDate: formData.get("entryDate"),
    amount: formData.get("amount"),
    payments: parsePaymentSplits(formData.get("paymentsJson"))
  });

  if (!parsed.success) {
    redirectWithError(
      parsed.error.issues[0]?.message ?? "No se pudo validar la reparacion",
      String(formData.get("id") ?? "")
    );
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const paymentTotal = getPaymentTotal(parsed.data.payments);
  const paymentErrorMessage = getRepairValidationError({
    amount: parsed.data.amount,
    payments: parsed.data.payments
  });
  if (paymentErrorMessage) redirectWithError(paymentErrorMessage, parsed.data.id);

  let clienteId = null;

  try {
    clienteId = await findOrCreateClient(supabase as any, parsed.data.customerName);
  } catch {
    clienteId = null;
  }

  const payload = {
    customer_name: parsed.data.customerName,
    cliente_id: clienteId,
    device: parsed.data.device,
    order_number: parsed.data.orderNumber || null,
    issue_description: parsed.data.orderNumber
      ? `Orden ${parsed.data.orderNumber}`
      : "Registro vinculado a sistema externo",
    estimated_price: parsed.data.amount,
    final_price: parsed.data.amount,
    observations: null,
    created_by: user.id,
    created_at: toOperationalDateTime(parsed.data.entryDate),
    updated_at: new Date().toISOString()
  };
  const fallbackPayload = {
    customer_name: payload.customer_name,
    device: payload.device,
    issue_description: payload.issue_description,
    estimated_price: payload.estimated_price,
    final_price: payload.final_price,
    observations: payload.observations,
    created_by: payload.created_by,
    created_at: payload.created_at,
    updated_at: payload.updated_at
  };

  let { data, error } = parsed.data.id
    ? await (supabase as any).from("repairs").update(payload).eq("id", parsed.data.id).select("id").single()
    : await (supabase as any).from("repairs").insert(payload).select("id").single();

  if (error?.message?.includes("order_number")) {
    const fallback = parsed.data.id
      ? await (supabase as any).from("repairs").update(fallbackPayload).eq("id", parsed.data.id).select("id").single()
      : await (supabase as any).from("repairs").insert(fallbackPayload).select("id").single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    redirectWithError(error?.message ?? "No se pudo guardar la reparacion", parsed.data.id);
  }

  await (supabase as any).from("repair_payments").delete().eq("repair_id", data.id);

  if (parsed.data.amount > 0 && parsed.data.payments.length) {
    const { error: paymentError } = await (supabase as any).from("repair_payments").insert(
      parsed.data.payments.map((payment) => ({
        repair_id: data.id,
        payment_date: parsed.data.entryDate.slice(0, 10),
        created_at: toOperationalDateTime(parsed.data.entryDate),
        method: payment.method,
        amount: payment.amount,
        notes: parsed.data.orderNumber ? `Orden ${parsed.data.orderNumber}` : null
      }))
    );

    if (paymentError) redirectWithError(paymentError.message, data.id);
  }

  await replaceCashMovements(supabase as any, {
    tipo: "reparacion",
    movimientos: parsed.data.payments.map((payment) => ({
      monto: payment.amount,
      medioPago: payment.method,
      descripcion: parsed.data.orderNumber ? `Reparacion orden ${parsed.data.orderNumber}` : "Reparacion"
    })),
    referenciaTabla: "repairs",
    referenciaId: data.id,
    userId: user.id,
    fecha: parsed.data.entryDate
  });

  await createAuditLog({
    entityType: "repairs",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: { ...payload, paymentTotal, payments: parsed.data.payments }
  });

  revalidatePath("/reparaciones");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect(`/reparaciones?status=${parsed.data.id ? "repair_updated" : "repair_created"}`);
}

export async function deleteRepairAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  await deleteCashMovement(supabase as any, "repairs", id);
  const { error } = await (supabase as any).from("repairs").delete().eq("id", id);

  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "repairs", entityId: id, action: "delete", userId: user.id });
  revalidatePath("/reparaciones");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/reparaciones?status=repair_deleted");
}
