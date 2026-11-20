"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parsePaymentSplits } from "@/lib/payment-splits";
import { getRepairValidationError } from "./validation";
import { readRepairPaymentTiming } from "./payment-timing";
import { readPickupAnswer, type PickupOutcome } from "@/features/repairs-access/pickup";
import { registerPickupForPaidOrder } from "@/features/repairs-access/pickup-server";

const paymentSchema = z.object({
  method: z.enum(["efectivo", "nx", "mp"]),
  amount: z.coerce.number().finite().positive().multipleOf(0.01)
});
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Selecciona una fecha valida.");
const repairSchema = z.object({
  id: z.string().uuid().optional(),
  requestId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  repairAccessOrderId: z.string().uuid().optional(),
  customerName: z.string().trim().min(1, "Ingresa el cliente").max(500),
  customerPhone: z.string().max(100),
  device: z.string().trim().min(1, "Ingresa el equipo").max(500),
  orderNumber: z.string().trim().max(100),
  issueDescription: z.string().trim().max(10000),
  entryDate: dateSchema,
  paymentDate: dateSchema,
  paymentTimestamp: z.string().datetime({ offset: true }).optional(),
  amount: z.coerce.number().finite().min(0).multipleOf(0.01),
  payments: z.array(paymentSchema).max(20)
});

function redirectWithError(message: string, id?: FormDataEntryValue | null): never {
  const params = new URLSearchParams({ error: message });
  if (typeof id === "string" && z.string().uuid().safeParse(id).success) params.set("edit", id);
  redirect(`/reparaciones?${params.toString()}`);
}

function refreshRepairs() {
  for (const path of [
    "/reparaciones",
    "/reparaciones-access",
    "/dashboard",
    "/caja",
    "/facturacion",
    "/reportes",
    "/sueldos"
  ])
    revalidatePath(path);
}

export type RepairPaymentSaveResult = {
  success: boolean;
  message: string;
  repairId?: string;
  /** Resultado de marcar el retiro cuando se respondió "Sí" a "¿Retiró el cliente?". */
  pickup?: PickupOutcome;
};

const PICKUP_NOTE = "Retiró al pagar.";

/**
 * Con "Sí, lo retiró" se registra la entrega después del cobro. Si falla, el cobro ya
 * quedó guardado: se avisa para marcar el retiro desde la ficha.
 */
async function registerPickupAfterPayment(
  supabase: unknown,
  orderId: string | null | undefined,
  answer: FormDataEntryValue | null,
  paidMessage: string
): Promise<Pick<RepairPaymentSaveResult, "message" | "pickup">> {
  if (readPickupAnswer(answer) !== "si" || !orderId) return { message: paidMessage };
  try {
    const pickup = await registerPickupForPaidOrder(supabase, orderId, PICKUP_NOTE);
    if (pickup.success)
      return { message: `${paidMessage} Retiro del equipo marcado.`, pickup: "done" };
    return {
      message: `${paidMessage} No se pudo marcar el retiro: ${pickup.message} Marcalo desde la ficha de la orden con Registrar entrega.`,
      pickup: "failed"
    };
  } catch {
    return {
      message: `${paidMessage} No se pudo marcar el retiro. Marcalo desde la ficha de la orden con Registrar entrega.`,
      pickup: "failed"
    };
  }
}

export async function saveRepairFormAction(formData: FormData): Promise<RepairPaymentSaveResult> {
  await requireAdmin();
  const timing = readRepairPaymentTiming(
    formData.get("paymentDate") || formData.get("entryDate"),
    formData.get("paymentTimestamp")
  );
  const parsed = repairSchema.safeParse({
    id: formData.get("id") || undefined,
    requestId: formData.get("requestId"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    repairAccessOrderId: formData.get("repairAccessOrderId") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") || "",
    device: formData.get("device"),
    orderNumber: formData.get("orderNumber") || "",
    issueDescription: formData.get("issueDescription") || "",
    entryDate: String(formData.get("entryDate") ?? "").slice(0, 10),
    ...timing,
    amount: formData.get("amount"),
    payments: parsePaymentSplits(formData.get("paymentsJson")).filter(
      (payment) => Number(payment.amount) !== 0
    )
  });
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa la reparacion." };
  if (!parsed.data.id) {
    const message = getRepairValidationError(parsed.data);
    if (message) return { success: false, message };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("save_repair_financial_atomic", {
    p_input: parsed.data
  });
  if (error)
    return {
      success: false,
      message: error.message || "No se pudo confirmar el cobro. Reintenta sin cambiar los datos."
    };
  const savedId = z.string().uuid().safeParse(data?.id);
  if (!savedId.success)
    return {
      success: false,
      message:
        "No se pudo confirmar el resultado. Reintenta sin cambiar los datos para recuperar el mismo guardado."
    };
  const pickup = parsed.data.id
    ? { message: "Datos actualizados." }
    : await registerPickupAfterPayment(
        supabase,
        parsed.data.repairAccessOrderId,
        formData.get("pickedUp"),
        "Registro y cobro guardados."
      );
  refreshRepairs();
  return { success: true, ...pickup, repairId: savedId.data };
}

export async function saveRepairAction(formData: FormData) {
  if (!formData.get("requestId")) formData.set("requestId", randomUUID());
  const result = await saveRepairFormAction(formData);
  if (!result.success) redirectWithError(result.message, formData.get("id"));
  redirect(
    `/reparaciones?status=${formData.get("id") ? "repair_updated" : "repair_created"}&edit=${result.repairId}`
  );
}

export async function addRepairPaymentFormAction(
  formData: FormData
): Promise<RepairPaymentSaveResult> {
  await requireAdmin();
  const parsed = z
    .object({
      repairId: z.string().uuid(),
      requestId: z.string().uuid(),
      paymentDate: dateSchema,
      paymentTimestamp: z.string().datetime({ offset: true }).optional(),
      payments: z
        .array(paymentSchema)
        .min(1, "Ingresa el importe recibido y elegi su medio de pago.")
        .max(20)
    })
    .safeParse({
      repairId: formData.get("repairId"),
      requestId: formData.get("requestId"),
      ...readRepairPaymentTiming(formData.get("paymentDate"), formData.get("paymentTimestamp")),
      payments: parsePaymentSplits(formData.get("paymentsJson")).filter(
        (payment) => Number(payment.amount) !== 0
      )
    });
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el cobro." };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("add_repair_payment_atomic", {
    p_input: parsed.data
  });
  if (error)
    return {
      success: false,
      message: error.message || "No se pudo confirmar el cobro. Reintenta sin cambiar los datos."
    };
  if (data?.id !== parsed.data.repairId)
    return {
      success: false,
      message:
        "No se pudo confirmar el resultado. Reintenta sin cambiar los datos para recuperar el mismo cobro."
    };
  let orderId: string | null = null;
  if (readPickupAnswer(formData.get("pickedUp")) === "si") {
    const link = await (supabase as any)
      .from("repairs")
      .select("repair_access_order_id")
      .eq("id", parsed.data.repairId)
      .maybeSingle();
    orderId = z.string().uuid().safeParse(link.data?.repair_access_order_id).data ?? null;
  }
  const pickup = await registerPickupAfterPayment(
    supabase,
    orderId,
    formData.get("pickedUp"),
    "Cobro registrado."
  );
  if (readPickupAnswer(formData.get("pickedUp")) === "si" && !orderId)
    Object.assign(pickup, {
      message:
        "Cobro registrado. Este cobro no está vinculado a una orden del taller: no hay retiro para marcar.",
      pickup: "failed"
    });
  refreshRepairs();
  return { success: true, ...pickup, repairId: parsed.data.repairId };
}

export async function addRepairPaymentAction(formData: FormData) {
  const result = await addRepairPaymentFormAction(formData);
  if (!result.success) redirectWithError(result.message, formData.get("repairId"));
  redirect(`/reparaciones?status=repair_payment_added&edit=${result.repairId}`);
}

export async function reverseRepairPaymentAction(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      repairId: z.string().uuid(),
      paymentId: z.string().uuid(),
      reason: z.string().trim().min(3, "Indica el motivo de la reversa.").max(1000)
    })
    .safeParse({
      repairId: formData.get("repairId"),
      paymentId: formData.get("paymentId"),
      reason: formData.get("reason")
    });
  if (!parsed.success)
    redirectWithError(
      parsed.error.issues[0]?.message ?? "Revisa la reversa.",
      formData.get("repairId")
    );
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("reverse_repair_payment_atomic", {
    p_repair_id: parsed.data.repairId,
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason
  });
  if (error) redirectWithError(error.message, parsed.data.repairId);
  refreshRepairs();
  redirect(`/reparaciones?status=repair_payment_reversed&edit=${parsed.data.repairId}`);
}

export async function deleteRepairAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("delete_repair_financial_atomic", {
    p_repair_id: id
  });
  if (error) redirectWithError(error.message, id);
  refreshRepairs();
  redirect("/reparaciones?status=repair_deleted");
}
