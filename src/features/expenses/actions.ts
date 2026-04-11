"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const expenseFormSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.string().min(1, "Ingresá una categoría"),
  description: z.string().min(1, "Ingresá una descripción"),
  amount: z.coerce.number().positive("Ingresá un monto válido"),
  paymentMethod: z.string().min(1, "Seleccioná un medio de pago"),
  observations: z.string().optional()
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/gastos?${params.toString()}`);
}

export async function saveExpenseAction(formData: FormData) {
  const parsed = expenseFormSchema.safeParse({
    id: formData.get("id") || undefined,
    type: formData.get("type"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    observations: formData.get("observations")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el gasto", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const payload = {
    expense_date: new Date().toISOString().slice(0, 10),
    type: parsed.data.type,
    description: parsed.data.description,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    impacts_cash: true,
    observations: parsed.data.observations || null,
    created_by: user.id
  };

  const { data, error } = parsed.data.id
    ? await (supabase as any)
        .from("expenses")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .single()
    : await (supabase as any).from("expenses").insert(payload).select("id").single();

  if (error || !data) {
    redirectWithError(error?.message ?? "No se pudo guardar el gasto", parsed.data.id);
  }

  await createAuditLog({
    entityType: "expenses",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  redirect(`/gastos?status=${parsed.data.id ? "expense_updated" : "expense_created"}`);
}

export async function deleteExpenseAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from("expenses").delete().eq("id", id);

  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "expenses", entityId: id, action: "delete", userId: user.id });
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  redirect("/gastos?status=expense_deleted");
}
