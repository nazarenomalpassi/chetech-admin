"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildAccessPaidPayload, buildAccessUnpaidPayload } from "@/features/repairs/repair-access-sync";
import { createAuditLog } from "@/lib/audit";
import { formatCashMethod } from "@/lib/cash";
import { deleteCashMovement, replaceCashMovements } from "@/lib/accounting";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getPaymentTotal, parsePaymentSplits } from "@/lib/payment-splits";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toOperationalDateTime } from "@/lib/utils";
import { getRepairValidationError } from "@/features/repairs/validation";

const repairFormSchema = z.object({
  id: z.string().uuid().optional(),
  repairAccessOrderId: z.string().uuid().optional(),
  customerName: z.string().min(1, "Ingresa el cliente"),
  customerPhone: z.string().optional(),
  device: z.string().min(1, "Ingresa el equipo"),
  orderNumber: z.string().trim().optional(),
  issueDescription: z.string().trim().optional(),
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

function isMissingColumnError(error: { message?: string } | null | undefined, columnNames: string[]) {
  const message = error?.message ?? "";
  return columnNames.some((columnName) => message.includes(columnName));
}

function buildRepairIssueDescription(orderNumber?: string, issueDescription?: string) {
  const cleanIssue = issueDescription?.trim();
  if (cleanIssue) return cleanIssue;
  return orderNumber ? `Orden ${orderNumber}` : "Registro vinculado a sistema externo";
}

function buildAccessPaymentNotes(payments: { method: string; amount: number }[], observations?: string | null) {
  const paymentSummary = payments
    .filter((payment) => Number(payment.amount) > 0)
    .map((payment) => `${formatCashMethod(payment.method)}: $${Number(payment.amount).toLocaleString("es-AR")}`)
    .join(" + ");

  return [observations?.trim(), paymentSummary ? `Cobro real en Reparaciones: ${paymentSummary}` : ""]
    .filter(Boolean)
    .join("\n") || null;
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

  const warrantyDays = Number(previousAccessOrder.data.warranty_days ?? 0);
  const accessPayload = buildAccessPaidPayload({ amount, paymentMethod, paymentNotes, userId, warrantyDays });

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
        notes: `Facturada desde Pagos de reparaciones (${repairId})`
      });
  }
}

async function markAccessOrderAsUnpaid({
  supabase,
  repairId,
  repairAccessOrderId,
  userId,
  notes
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  repairId: string;
  repairAccessOrderId: string;
  userId: string;
  notes: string;
}) {
  const previousAccessOrder = await (supabase as any)
    .from("repair_access_orders")
    .select("id, status")
    .eq("id", repairAccessOrderId)
    .maybeSingle();

  if (previousAccessOrder.error || !previousAccessOrder.data) {
    redirectWithError(previousAccessOrder.error?.message ?? "No se encontro la orden Access vinculada.", repairId);
  }

  const accessPayload = buildAccessUnpaidPayload({ userId });
  const { error: accessUpdateError } = await (supabase as any)
    .from("repair_access_orders")
    .update(accessPayload)
    .eq("id", repairAccessOrderId);

  if (accessUpdateError) redirectWithError(accessUpdateError.message, repairId);

  if (previousAccessOrder.data.status !== accessPayload.status) {
    await (supabase as any)
      .from("repair_access_status_history")
      .insert({
        repair_order_id: repairAccessOrderId,
        previous_status: previousAccessOrder.data.status,
        next_status: accessPayload.status,
        changed_by: userId,
        notes
      });
  }
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
    repairAccessOrderId: formData.get("repairAccessOrderId") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    device: formData.get("device"),
    orderNumber: formData.get("orderNumber"),
    issueDescription: formData.get("issueDescription"),
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

  let previousAccessOrderId: string | null = null;
  if (parsed.data.id) {
    const previousRepair = await (supabase as any)
      .from("repairs")
      .select("id, repair_access_order_id")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (previousRepair.error && !isMissingColumnError(previousRepair.error, ["repair_access_order_id"])) {
      redirectWithError(previousRepair.error.message, parsed.data.id);
    }

    previousAccessOrderId = previousRepair.data?.repair_access_order_id ?? null;
  }

  const payload = {
    repair_access_order_id: parsed.data.repairAccessOrderId ?? null,
    customer_name: parsed.data.customerName,
    customer_phone: parsed.data.customerPhone || null,
    cliente_id: clienteId,
    device: parsed.data.device,
    order_number: parsed.data.orderNumber || null,
    issue_description: buildRepairIssueDescription(parsed.data.orderNumber, parsed.data.issueDescription),
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

  let savedWithAccessLink = Boolean(parsed.data.repairAccessOrderId);
  let { data, error } = parsed.data.id
    ? await (supabase as any).from("repairs").update(payload).eq("id", parsed.data.id).select("id").single()
    : await (supabase as any).from("repairs").insert(payload).select("id").single();

  if (isMissingColumnError(error, ["repair_access_order_id", "customer_phone", "order_number", "cliente_id"])) {
    savedWithAccessLink = false;
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

  const nextAccessOrderId = savedWithAccessLink ? (parsed.data.repairAccessOrderId ?? null) : null;
  if (previousAccessOrderId && previousAccessOrderId !== nextAccessOrderId) {
    await markAccessOrderAsUnpaid({
      supabase,
      repairId: data.id,
      repairAccessOrderId: previousAccessOrderId,
      userId: user.id,
      notes: `Cobro desvinculado desde Pagos de reparaciones (${data.id})`
    });
  }

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

  try {
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
  } catch (cashError) {
    redirectWithError(cashError instanceof Error ? cashError.message : "No se pudo actualizar caja.", data.id);
  }

  if (nextAccessOrderId && parsed.data.amount > 0) {
    await markAccessOrderAsRetired({
      supabase,
      repairId: data.id,
      repairAccessOrderId: nextAccessOrderId,
      amount: parsed.data.amount,
      paymentMethod: parsed.data.payments[0]?.method ?? "efectivo",
      paymentNotes: buildAccessPaymentNotes(parsed.data.payments, parsed.data.orderNumber ? `Orden ${parsed.data.orderNumber}` : null),
      userId: user.id
    });
  } else if (nextAccessOrderId) {
    await markAccessOrderAsUnpaid({
      supabase,
      repairId: data.id,
      repairAccessOrderId: nextAccessOrderId,
      userId: user.id,
      notes: `Cobro revertido desde Pagos de reparaciones (${data.id})`
    });
  }

  await createAuditLog({
    entityType: "repairs",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: { ...payload, paymentTotal, payments: parsed.data.payments }
  });

  revalidatePath("/reparaciones");
  revalidatePath("/reparaciones-access");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect(`/reparaciones?status=${parsed.data.id ? "repair_updated" : "repair_created"}`);
}

export async function deleteRepairAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const existingRepair = await (supabase as any)
    .from("repairs")
    .select("id, repair_access_order_id")
    .eq("id", id)
    .maybeSingle();

  if (existingRepair.error && !isMissingColumnError(existingRepair.error, ["repair_access_order_id"])) {
    redirectWithError(existingRepair.error.message, id);
  }

  if (existingRepair.data?.repair_access_order_id) {
    await markAccessOrderAsUnpaid({
      supabase,
      repairId: id,
      repairAccessOrderId: existingRepair.data.repair_access_order_id,
      userId: user.id,
      notes: `Reparacion eliminada y cobro revertido (${id})`
    });
  }

  await deleteCashMovement(supabase as any, "repairs", id);
  const { error } = await (supabase as any).from("repairs").delete().eq("id", id);

  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "repairs", entityId: id, action: "delete", userId: user.id });
  revalidatePath("/reparaciones");
  revalidatePath("/reparaciones-access");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/reparaciones?status=repair_deleted");
}
