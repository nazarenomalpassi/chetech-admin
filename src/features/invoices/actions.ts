"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invoiceFormSchema } from "./schemas";

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/facturacion?${params.toString()}` as Route);
}

function parseItems(formData: FormData) {
  try { return JSON.parse(String(formData.get("itemsJson") ?? "[]")); } catch { return []; }
}

export async function saveInvoiceAction(formData: FormData) {
  await requireAdmin();
  const parsed = invoiceFormSchema.safeParse({
    id: formData.get("id") || undefined,
    requestId: formData.get("requestId") || randomUUID(),
    expectedVersion: formData.get("expectedVersion") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") || "",
    sourceType: formData.get("sourceType") || "manual",
    repairId: formData.get("repairId") || null,
    repairAccessOrderId: formData.get("repairAccessOrderId") || null,
    saleId: formData.get("saleId") || null,
    discount: formData.get("discount") || 0,
    notes: formData.get("notes") || "",
    fiscalProvider: formData.get("fiscalProvider") || undefined,
    fiscalReference: formData.get("fiscalReference") || undefined,
    fiscalIssuedAt: formData.get("fiscalIssuedAt") ? `${String(formData.get("fiscalIssuedAt")).slice(0, 10)}T00:00:00-03:00` : undefined,
    items: parseItems(formData)
  });
  if (!parsed.success) redirectWithError(parsed.error.issues[0]?.message ?? "Revisa el comprobante.", String(formData.get("id") ?? ""));
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("save_invoice_atomic", { p_input: parsed.data });
  if (error || !data) redirectWithError(error?.message ?? "No se pudo guardar el comprobante.", parsed.data.id);
  revalidatePath("/facturacion");
  if (parsed.data.id) revalidatePath(`/facturacion/${parsed.data.id}`);
  redirect(`/facturacion?status=${data.action === "insert" ? "invoice_created" : "invoice_updated"}`);
}

export async function voidInvoiceAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), expectedVersion: z.coerce.number().int().positive() }).safeParse({ id: formData.get("id"), expectedVersion: formData.get("expectedVersion") });
  if (!parsed.success) redirectWithError("Recarga el comprobante antes de anular.");
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("void_invoice_atomic", { p_invoice_id: parsed.data.id, p_expected_version: parsed.data.expectedVersion });
  if (error) redirectWithError(error.message);
  revalidatePath("/facturacion"); revalidatePath(`/facturacion/${parsed.data.id}`);
  redirect("/facturacion?status=invoice_voided");
}
