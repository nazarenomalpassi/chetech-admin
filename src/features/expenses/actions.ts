"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";

const expenseFormSchema = z.object({
  id: z.string().uuid().optional(),
  operationId: z.string().uuid(),
  expenseDate: z.string().min(1, "Selecciona la fecha del gasto"),
  type: z.string().min(1, "Ingresa una categoria"),
  description: z.string().min(1, "Ingresa una descripcion"),
  amount: z.coerce.number().positive("Ingresa un monto valido"),
  paymentMethod: z.string().min(1, "Selecciona un medio de pago"),
  observations: z.string().optional(),
  partRequestId: z.string().uuid().nullable().optional(),
  repairOrderId: z.string().uuid().nullable().optional()
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/gastos?${params.toString()}`);
}

export async function saveExpenseAction(formData: FormData) {
  const parsed = expenseFormSchema.safeParse({
    id: formData.get("id") || undefined,
    operationId: formData.get("operationId"),
    expenseDate: formData.get("expenseDate"),
    type: formData.get("type"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    observations: formData.get("observations") || undefined,
    ...(formData.has("partRequestId") ? { partRequestId: formData.get("partRequestId") || null } : {}),
    ...(formData.has("repairOrderId") ? { repairOrderId: formData.get("repairOrderId") || null } : {})
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el gasto", String(formData.get("id") ?? ""));
  }
  if ((formData.get("linkKind") === "part" && !parsed.data.partRequestId) ||
      (formData.get("linkKind") === "repair" && !parsed.data.repairOrderId)) redirectWithError("Selecciona el destino del gasto.", parsed.data.id);

  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { operationId, ...payload } = parsed.data;
  const { error } = await (supabase as any).rpc("save_expense_linked_atomic", {
    p_operation_id: operationId,
    p_payload: payload
  });
  // No legacy fallback: a missing RPC must not leave a paid expense without its link.
  if (error) redirectWithError(error.message, parsed.data.id);

  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  revalidatePath("/sueldos");
  revalidatePath("/pedidos");
  const params = new URLSearchParams({ status: parsed.data.id ? "expense_updated" : "expense_created", savedOperation: operationId, savedScope: parsed.data.id ?? "new" });
  redirect(`/gastos?${params}`);
}

export async function linkExpensePurchaseAction(formData: FormData) {
  const nullableId = z.string().uuid().nullable();
  const parsed = z.object({
    id: z.string().uuid(), partRequestId: nullableId, repairOrderId: nullableId,
    expectedOrderId: nullableId, expectedPartId: nullableId
  }).safeParse(Object.fromEntries(["id", "partRequestId", "repairOrderId", "expectedOrderId", "expectedPartId"]
    .map((key) => [key, formData.get(key) || null])));
  if (!parsed.success) redirectWithError("Revisa el gasto y el vinculo seleccionado.");
  if ((formData.get("linkKind") === "part" && !parsed.data.partRequestId) ||
      (formData.get("linkKind") === "repair" && !parsed.data.repairOrderId)) redirectWithError("Selecciona el destino del gasto.");
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("link_expense_purchase_atomic", {
    p_expense_id: parsed.data.id, p_part_request_id: parsed.data.partRequestId,
    p_repair_order_id: parsed.data.repairOrderId, p_expected_order_id: parsed.data.expectedOrderId,
    p_expected_part_id: parsed.data.expectedPartId
  });
  if (error) redirectWithError(error.message);
  revalidatePath("/gastos");
  revalidatePath("/sueldos");
  revalidatePath("/pedidos");
  redirect("/gastos?status=expense_linked");
}

export async function getExpenseLinkOptionsAction(kind: "part" | "repair", search: string, page: number) {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const parsed = z.object({ kind: z.enum(["part", "repair"]), search: z.string().max(100), page: z.number().int().min(1).max(100000) }).safeParse({ kind, search, page });
  if (!parsed.success) return { error: "Revisa la busqueda.", data: null };
  const { data, error } = await (supabase as any).rpc("get_expense_link_options", {
    p_kind: kind, p_search: search, p_page: page
  });
  return { error: error?.message ?? null, data: data as import("./linkage-types").ExpenseLinkOptions | null };
}

export async function deleteExpenseAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const atomicResult = await (supabase as any).rpc("delete_expense_atomic", {
    p_expense_id: id
  });

  if (!atomicResult.error) {
    revalidatePath("/gastos");
    revalidatePath("/dashboard");
    revalidatePath("/caja");
    revalidatePath("/sueldos");
    redirect("/gastos?status=expense_deleted");
  }

  if (!isMissingDatabaseFunctionError(atomicResult.error, "delete_expense_atomic")) {
    redirectWithError(atomicResult.error.message);
  }

  await deleteCashMovement(supabase as any, "expenses", id);
  const { error } = await (supabase as any).from("expenses").delete().eq("id", id);

  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "expenses", entityId: id, action: "delete", userId: user.id });
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  revalidatePath("/sueldos");
  redirect("/gastos?status=expense_deleted");
}
