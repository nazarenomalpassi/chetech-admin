"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  productId: z.string().uuid(),
  quantityToOrder: z.coerce.number().int().nonnegative("La cantidad no puede ser negativa"),
  status: z.enum(["pending", "added", "ordered", "received"]),
  notes: z.string().max(500).optional(),
  search: z.string().optional()
});

function destination(month: string, status?: string, error?: string, search?: string) {
  const params = new URLSearchParams({ month });
  if (status) params.set("status", status);
  if (error) params.set("error", error);
  if (search) params.set("search", search);
  return `/pedidos?${params.toString()}` as Route;
}

export async function saveReplenishmentItemAction(formData: FormData) {
  const parsed = schema.safeParse({
    periodMonth: formData.get("periodMonth"),
    productId: formData.get("productId"),
    quantityToOrder: formData.get("quantityToOrder"),
    status: formData.get("status"),
    notes: formData.get("notes") || undefined,
    search: formData.get("search") || undefined
  });
  if (!parsed.success) {
    redirect(destination(String(formData.get("periodMonth") ?? ""), undefined, parsed.error.issues[0]?.message ?? "Revisa el pedido"));
  }

  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc("save_replenishment_plan_item", {
    p_period_month: `${parsed.data.periodMonth}-01`,
    p_product_id: parsed.data.productId,
    p_quantity_to_order: parsed.data.quantityToOrder,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes ?? null
  });
  if (error) redirect(destination(parsed.data.periodMonth, undefined, error.message, parsed.data.search));

  revalidatePath("/pedidos");
  revalidatePath("/sueldos");
  redirect(destination(parsed.data.periodMonth, "order_updated", undefined, parsed.data.search));
}
