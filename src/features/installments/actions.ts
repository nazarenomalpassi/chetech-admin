"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const paymentMethod = z.enum(["efectivo", "nx", "mp"]);
const amount = z.coerce.number().finite().positive().multipleOf(0.01);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Selecciona una fecha valida.");
const installment = z.object({ installmentNumber: z.coerce.number().int().positive(), dueDate: date, amount, paymentMethod, notes: z.string().max(1000).optional() });

function fail(message: string): never { redirect(`/cuotas?error=${encodeURIComponent(message)}` as Route); }
function refresh() { for (const path of ["/cuotas", "/dashboard", "/caja"]) revalidatePath(path); }
function parse(value: FormDataEntryValue | null) { try { return JSON.parse(String(value)); } catch { return []; } }

export async function saveInstallmentSaleAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    requestId: z.string().uuid(), productName: z.string().trim().min(1).max(500), customerName: z.string().trim().min(1).max(500),
    totalAmount: amount, installmentsCount: z.coerce.number().int().min(1).max(600), notes: z.string().max(10000), installments: z.array(installment).min(1).max(600)
  }).safeParse({ requestId: formData.get("requestId") || randomUUID(), productName: formData.get("productName"), customerName: formData.get("customerName"), totalAmount: formData.get("totalAmount"), installmentsCount: formData.get("installmentsCount"), notes: formData.get("notes") || "", installments: parse(formData.get("installmentsJson")) });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Revisa la venta en cuotas.");
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("save_installment_sale_atomic", { p_input: parsed.data });
  if (error) fail(error.message);
  refresh(); redirect("/cuotas?status=installment_sale_created" as Route);
}

export async function markInstallmentPaidAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), paymentMethod, paidDate: date }).safeParse({ id: formData.get("id"), paymentMethod: formData.get("paymentMethod"), paidDate: formData.get("paidDate") });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Revisa el cobro de la cuota.");
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("pay_installment_atomic", { p_installment_id: parsed.data.id, p_payment_method: parsed.data.paymentMethod, p_paid_date: parsed.data.paidDate });
  if (error) fail(error.message);
  refresh(); redirect("/cuotas?status=installment_paid" as Route);
}

export async function updateInstallmentAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), expectedVersion: z.coerce.number().int().positive(), dueDate: date, amount, paymentMethod, notes: z.string().max(1000) }).safeParse({ id: formData.get("id"), expectedVersion: formData.get("expectedVersion"), dueDate: formData.get("dueDate"), amount: formData.get("amount"), paymentMethod: formData.get("paymentMethod"), notes: formData.get("notes") || "" });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Revisa la cuota.");
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("mutate_installment_atomic", { p_input: { ...parsed.data, action: "update" } });
  if (error) fail(error.message);
  refresh(); redirect("/cuotas?status=installment_updated" as Route);
}

export async function cancelInstallmentAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), expectedVersion: z.coerce.number().int().positive() }).safeParse({ id: formData.get("id"), expectedVersion: formData.get("expectedVersion") });
  if (!parsed.success) fail("Recarga la cuota antes de cancelarla.");
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("mutate_installment_atomic", { p_input: { ...parsed.data, action: "cancel" } });
  if (error) fail(error.message);
  refresh(); redirect("/cuotas?status=installment_cancelled" as Route);
}

export async function cancelInstallmentSaleAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("cancel_installment_sale_atomic", { p_sale_id: id });
  if (error) fail(error.message);
  refresh(); redirect("/cuotas?status=installment_sale_cancelled" as Route);
}
