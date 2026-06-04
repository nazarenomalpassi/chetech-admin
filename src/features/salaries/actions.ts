"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement, replaceCashMovement } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const salaryWithdrawalSchema = z.object({
  id: z.string().uuid().optional(),
  withdrawalDate: z.string().min(1, "Selecciona la fecha de retiro"),
  amount: z.coerce.number().positive("Ingresa un monto valido"),
  paymentMethod: z.enum(["efectivo", "nx", "mp"], {
    message: "Selecciona la cuenta de salida"
  }),
  notes: z.string().optional()
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/sueldos?${params.toString()}` as Route);
}

export async function saveSalaryWithdrawalAction(formData: FormData) {
  const parsed = salaryWithdrawalSchema.safeParse({
    id: formData.get("id") || undefined,
    withdrawalDate: formData.get("withdrawalDate"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el retiro", String(formData.get("id") ?? ""));
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const payload = {
    withdrawal_date: parsed.data.withdrawalDate,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    notes: parsed.data.notes || null,
    created_by: user.id
  };

  const { data, error } = parsed.data.id
    ? await (supabase as any)
        .from("salary_withdrawals")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .single()
    : await (supabase as any).from("salary_withdrawals").insert(payload).select("id").single();

  if (error || !data) {
    const message = error?.code === "42P01"
      ? "Falta ejecutar la migracion de sueldos en Supabase antes de usar este modulo."
      : error?.message ?? "No se pudo guardar el retiro";
    redirectWithError(message, parsed.data.id);
  }

  await replaceCashMovement(supabase as any, {
    tipo: "sueldo",
    monto: parsed.data.amount,
    medioPago: parsed.data.paymentMethod,
    descripcion: `Retiro de sueldo ${parsed.data.withdrawalDate}`,
    referenciaTabla: "salary_withdrawals",
    referenciaId: data.id,
    userId: user.id
  });

  await createAuditLog({
    entityType: "salary_withdrawals",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/sueldos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect(`/sueldos?status=${parsed.data.id ? "salary_updated" : "salary_created"}` as Route);
}

export async function deleteSalaryWithdrawalAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();

  await deleteCashMovement(supabase as any, "salary_withdrawals", id);
  const { error } = await (supabase as any).from("salary_withdrawals").delete().eq("id", id);

  if (error) {
    const message = error.code === "42P01"
      ? "Falta ejecutar la migracion de sueldos en Supabase antes de usar este modulo."
      : error.message;
    redirectWithError(message);
  }

  await createAuditLog({
    entityType: "salary_withdrawals",
    entityId: id,
    action: "delete",
    userId: user.id
  });

  revalidatePath("/sueldos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect("/sueldos?status=salary_deleted" as Route);
}
