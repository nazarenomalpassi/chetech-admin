"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement, replaceCashMovement } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Selecciona un mes valido");

const salaryWithdrawalSchema = z.object({
  id: z.string().uuid().optional(),
  withdrawalDate: z.string().min(1, "Selecciona la fecha de retiro"),
  amount: z.coerce.number().positive("Ingresa un monto valido"),
  paymentMethod: z.enum(["efectivo", "nx", "mp"], {
    message: "Selecciona la cuenta de salida"
  }),
  notes: z.string().optional()
});

const salaryLiquidationSchema = z.object({
  periodMonth: monthSchema,
  withdrawalDate: z.string().date("Selecciona una fecha valida"),
  intendedTotal: z.coerce.number().positive("El retiro debe ser mayor a cero"),
  allocations: z.array(z.object({
    memberId: z.string().uuid(),
    salaryAmount: z.coerce.number().nonnegative(),
    profitShareAmount: z.coerce.number().nonnegative(),
    totalAmount: z.coerce.number().nonnegative()
  })).min(1),
  fundingSources: z.array(z.object({
    paymentMethod: z.enum(["efectivo", "nx", "mp"]),
    amount: z.coerce.number().nonnegative()
  })).min(1).max(3).superRefine((sources, context) => {
    if (new Set(sources.map((source) => source.paymentMethod)).size !== sources.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "No repitas cuentas en el retiro" });
    }
  }),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid()
});

const planningConfigSchema = z.object({
  periodMonth: monthSchema,
  members: z.array(z.object({ id: z.string().uuid(), targetAmount: z.coerce.number().positive() })).min(1),
  reserves: z.array(z.object({ id: z.string().uuid(), amount: z.coerce.number().nonnegative() }))
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/sueldos?${params.toString()}` as Route);
}

function redirectPlanningError(message: string, month?: string): never {
  const params = new URLSearchParams({ error: message });
  if (month) params.set("month", month);
  redirect(`/sueldos?${params.toString()}` as Route);
}

async function assertExtraordinaryWithdrawal(supabase: any, id?: string) {
  if (!id) return;
  const { data, error } = await supabase
    .from("salary_withdrawals")
    .select("withdrawal_type")
    .eq("id", id)
    .single();
  if (error) redirectWithError(error.message, id);
  if (data?.withdrawal_type === "salary") {
    redirectWithError("Las liquidaciones confirmadas no se editan ni eliminan desde retiros manuales.");
  }
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
  await assertExtraordinaryWithdrawal(supabase, parsed.data.id);
  const atomicResult = await (supabase as any).rpc("save_salary_withdrawal_atomic", {
    p_withdrawal_id: parsed.data.id ?? null,
    p_withdrawal_date: parsed.data.withdrawalDate,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.paymentMethod,
    p_notes: parsed.data.notes || null
  });

  if (!atomicResult.error) {
    revalidatePath("/sueldos");
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    redirect(`/sueldos?status=${parsed.data.id ? "salary_updated" : "salary_created"}` as Route);
  }

  if (!isMissingDatabaseFunctionError(atomicResult.error, "save_salary_withdrawal_atomic")) {
    redirectWithError(atomicResult.error.message, parsed.data.id);
  }

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
  await assertExtraordinaryWithdrawal(supabase, id);
  const atomicResult = await (supabase as any).rpc("delete_salary_withdrawal_atomic", {
    p_withdrawal_id: id
  });

  if (!atomicResult.error) {
    revalidatePath("/sueldos");
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    redirect("/sueldos?status=salary_deleted" as Route);
  }

  if (!isMissingDatabaseFunctionError(atomicResult.error, "delete_salary_withdrawal_atomic")) {
    redirectWithError(atomicResult.error.message);
  }

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

export async function confirmSalaryLiquidationAction(formData: FormData) {
  let allocations: unknown = [];
  let fundingSources: unknown = [];
  try {
    allocations = JSON.parse(String(formData.get("allocationsJson") ?? "[]"));
    fundingSources = JSON.parse(String(formData.get("fundingSourcesJson") ?? "[]"));
  } catch {
    redirectPlanningError("No se pudo leer la distribucion de la liquidacion.", String(formData.get("periodMonth") ?? ""));
  }

  const parsed = salaryLiquidationSchema.safeParse({
    periodMonth: formData.get("periodMonth"),
    withdrawalDate: formData.get("withdrawalDate"),
    intendedTotal: formData.get("intendedTotal"),
    allocations,
    fundingSources,
    notes: formData.get("notes") || undefined,
    idempotencyKey: formData.get("idempotencyKey")
  });
  if (!parsed.success) {
    redirectPlanningError(parsed.error.issues[0]?.message ?? "Revisa la liquidacion.", String(formData.get("periodMonth") ?? ""));
  }

  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("confirm_salary_liquidation", {
    p_period_month: `${parsed.data.periodMonth}-01`,
    p_withdrawal_date: parsed.data.withdrawalDate,
    p_intended_total: parsed.data.intendedTotal,
    p_allocations: parsed.data.allocations,
    p_funding_sources: parsed.data.fundingSources,
    p_notes: parsed.data.notes ?? null,
    p_idempotency_key: parsed.data.idempotencyKey
  });
  if (error) redirectPlanningError(error.message, parsed.data.periodMonth);

  revalidatePath("/sueldos");
  revalidatePath("/pedidos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
  redirect(`/sueldos?month=${parsed.data.periodMonth}&status=salary_liquidated` as Route);
}

export async function saveSalaryPlanningConfigAction(formData: FormData) {
  let members: unknown = [];
  let reserves: unknown = [];
  try {
    members = JSON.parse(String(formData.get("membersJson") ?? "[]"));
    reserves = JSON.parse(String(formData.get("reservesJson") ?? "[]"));
  } catch {
    redirectPlanningError("No se pudo leer la configuracion.", String(formData.get("periodMonth") ?? ""));
  }
  const parsed = planningConfigSchema.safeParse({
    periodMonth: formData.get("periodMonth"),
    members,
    reserves
  });
  if (!parsed.success) {
    redirectPlanningError(parsed.error.issues[0]?.message ?? "Revisa la configuracion.", String(formData.get("periodMonth") ?? ""));
  }

  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("save_salary_planning_config", {
    p_members: parsed.data.members,
    p_reserves: parsed.data.reserves
  });
  if (error) redirectPlanningError(error.message, parsed.data.periodMonth);

  revalidatePath("/sueldos");
  redirect(`/sueldos?month=${parsed.data.periodMonth}&status=salary_config_updated` as Route);
}
