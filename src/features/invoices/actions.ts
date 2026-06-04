"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement } from "@/lib/accounting";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invoiceFormSchema } from "@/features/invoices/schemas";

function redirectWithError(path: string, message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`${path}?${params.toString()}` as Route);
}

function parseJsonField<T>(formData: FormData, key: string, fallback: T): T {
  const raw = formData.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

async function refreshInvoice(supabase: any, invoiceId: string) {
  const { error } = await supabase.rpc("refresh_invoice_totals", { p_invoice_id: invoiceId });
  if (error) throw error;
}

export async function saveInvoiceAction(formData: FormData) {
  const parsed = invoiceFormSchema.safeParse({
    id: formData.get("id") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    sourceType: formData.get("sourceType") || "manual",
    repairId: formData.get("repairId") || null,
    saleId: formData.get("saleId") || null,
    discount: formData.get("discount") || 0,
    notes: formData.get("notes"),
    items: parseJsonField(formData, "itemsJson", [])
  });

  if (!parsed.success) {
    redirectWithError("/facturacion", parsed.error.issues[0]?.message ?? "No se pudo validar el comprobante", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const input = parsed.data;
  const sourceType = input.sourceType;
  const repairId = sourceType === "repair" ? input.repairId ?? null : null;
  const saleId = sourceType === "sale" ? input.saleId ?? null : null;

  let invoiceId = input.id;
  let auditAction: "insert" | "update" = "update";

  if (invoiceId) {
    const { data: invoice } = await (supabase as any)
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .single();

    if (invoice?.status === "anulado") {
      redirectWithError("/facturacion", "No se puede editar un comprobante anulado", invoiceId);
    }

    const { error } = await (supabase as any)
      .from("invoices")
      .update({
        customer_name: input.customerName,
        customer_phone: input.customerPhone || null,
        source_type: sourceType,
        repair_id: repairId,
        sale_id: saleId,
        discount: input.discount,
        notes: input.notes || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", invoiceId);

    if (error) redirectWithError("/facturacion", error.message, invoiceId);
  } else {
    auditAction = "insert";
    const { data, error } = await (supabase as any)
      .rpc("create_invoice_with_number", {
        p_customer_name: input.customerName,
        p_customer_phone: input.customerPhone || null,
        p_source_type: sourceType,
        p_repair_id: repairId,
        p_sale_id: saleId,
        p_discount: input.discount,
        p_notes: input.notes || null,
        p_created_by: user.id
      })
      .single();

    if (error || !data) redirectWithError("/facturacion", error?.message ?? "No se pudo crear el comprobante");
    invoiceId = data.id;
  }

  await (supabase as any).from("invoice_items").delete().eq("invoice_id", invoiceId);
  await (supabase as any).from("invoice_payments").delete().eq("invoice_id", invoiceId);
  await deleteCashMovement(supabase as any, "invoices", invoiceId!);

  const items = input.items.map((item) => ({
    invoice_id: invoiceId,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total: item.quantity * item.unitPrice,
    product_id: item.productId ?? null,
    repair_id: item.repairId ?? repairId
  }));

  const { error: itemsError } = await (supabase as any).from("invoice_items").insert(items);
  if (itemsError) redirectWithError("/facturacion", itemsError.message, invoiceId);

  try {
    await refreshInvoice(supabase as any, invoiceId!);
    const { data: totals, error: totalsError } = await (supabase as any)
      .from("invoices")
      .select("total")
      .eq("id", invoiceId)
      .single();

    if (totalsError || !totals) throw totalsError ?? new Error("No se pudo leer el total del comprobante");

    const { error: statusError } = await (supabase as any)
      .from("invoices")
      .update({
        paid_total: Number(totals.total),
        balance: 0,
        status: "pagado",
        updated_at: new Date().toISOString()
      })
      .eq("id", invoiceId);

    if (statusError) throw statusError;
  } catch (error) {
    redirectWithError("/facturacion", error instanceof Error ? error.message : "No se pudo recalcular el comprobante", invoiceId);
  }

  await createAuditLog({
    entityType: "invoices",
    entityId: invoiceId!,
    action: auditAction,
    userId: user.id,
    changes: input
  });

  revalidatePath("/facturacion");
  revalidatePath("/dashboard");
  redirect(`/facturacion?status=${auditAction === "insert" ? "invoice_created" : "invoice_updated"}`);
}

export async function voidInvoiceAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any)
    .from("invoices")
    .update({ status: "anulado", balance: 0, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) redirectWithError("/facturacion", error.message);

  await createAuditLog({ entityType: "invoices", entityId: id, action: "update", userId: user.id, changes: { status: "anulado" } });
  await deleteCashMovement(supabase as any, "invoices", id);
  revalidatePath("/facturacion");
  revalidatePath("/dashboard");
  redirect("/facturacion?status=invoice_voided");
}
