"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const saleFormSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid("Seleccioná un producto"),
  quantity: z.coerce.number().int().positive("Ingresá una cantidad válida"),
  unitPrice: z.coerce.number().min(0, "Ingresá un precio válido"),
  paymentMethod: z.string().min(1, "Seleccioná un medio de pago"),
  notes: z.string().optional()
});

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/ventas?${params.toString()}`);
}

async function getNextSaleNumber(supabase: any) {
  const { count } = await supabase.from("sales").select("*", { count: "exact", head: true });
  return `V-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function saveSaleAction(formData: FormData) {
  const parsed = saleFormSchema.safeParse({
    id: formData.get("id") || undefined,
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unitPrice"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la venta", String(formData.get("id") ?? ""));
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const input = parsed.data;
  const total = input.quantity * input.unitPrice;

  const { data: product, error: productError } = await (supabase as any)
    .from("products")
    .select("id, stock, cost, sale_price")
    .eq("id", input.productId)
    .single();

  if (productError || !product) {
    redirectWithError("No se encontró el producto seleccionado.", input.id);
  }

  const oldItemResult = input.id
    ? await (supabase as any)
        .from("sale_items")
        .select("id, product_id, quantity")
        .eq("sale_id", input.id)
        .maybeSingle()
    : { data: null, error: null };

  if (oldItemResult.error) {
    redirectWithError(oldItemResult.error.message, input.id);
  }

  const oldItem = oldItemResult.data;
  const availableStock =
    Number(product.stock) +
    (oldItem?.product_id === input.productId ? Number(oldItem.quantity) : 0);

  if (availableStock < input.quantity) {
    redirectWithError(`Stock insuficiente. Disponible: ${availableStock}.`, input.id);
  }

  if (oldItem && oldItem.product_id !== input.productId) {
    const oldProductResult = await (supabase as any)
      .from("products")
      .select("stock")
      .eq("id", oldItem.product_id)
      .single();

    if (!oldProductResult.error && oldProductResult.data) {
      await (supabase as any)
        .from("products")
        .update({ stock: Number(oldProductResult.data.stock) + Number(oldItem.quantity) })
        .eq("id", oldItem.product_id);
    }
  }

  const newStock = availableStock - input.quantity;
  const costTotal = Number(product.cost) * input.quantity;
  const profitTotal = total - costTotal;

  let saleId = input.id;
  let action: "insert" | "update" = "update";

  if (saleId) {
    const { error } = await (supabase as any)
      .from("sales")
      .update({
        subtotal: total,
        cost_total: costTotal,
        profit_total: profitTotal,
        notes: input.notes || null
      })
      .eq("id", saleId);

    if (error) redirectWithError(error.message, saleId);
  } else {
    action = "insert";
    const { data, error } = await (supabase as any)
      .from("sales")
      .insert({
        sale_number: await getNextSaleNumber(supabase as any),
        subtotal: total,
        cost_total: costTotal,
        profit_total: profitTotal,
        notes: input.notes || null,
        created_by: user.id
      })
      .select("id")
      .single();

    if (error || !data) redirectWithError(error?.message ?? "No se pudo crear la venta.");
    saleId = data.id;
  }

  await (supabase as any).from("sale_items").delete().eq("sale_id", saleId);
  await (supabase as any).from("sale_payments").delete().eq("sale_id", saleId);
  await (supabase as any).from("stock_movements").delete().eq("reference_id", saleId).eq("movement_type", "sale");

  const { error: itemError } = await (supabase as any).from("sale_items").insert({
    sale_id: saleId,
    product_id: input.productId,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    unit_cost: Number(product.cost),
    total
  });

  if (itemError) redirectWithError(itemError.message, saleId);

  const { error: paymentError } = await (supabase as any).from("sale_payments").insert({
    sale_id: saleId,
    method: input.paymentMethod,
    amount: total
  });

  if (paymentError) redirectWithError(paymentError.message, saleId);

  await (supabase as any).from("stock_movements").insert({
    product_id: input.productId,
    movement_type: "sale",
    quantity: -input.quantity,
    reference_id: saleId,
    notes: input.notes || "Venta manual"
  });

  await (supabase as any).from("products").update({ stock: newStock }).eq("id", input.productId);

  await createAuditLog({
    entityType: "sales",
    entityId: saleId!,
    action,
    userId: user.id,
    changes: input
  });

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  redirect(`/ventas?status=${action === "insert" ? "sale_created" : "sale_updated"}`);
}

export async function deleteSaleAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data: item } = await (supabase as any)
    .from("sale_items")
    .select("product_id, quantity")
    .eq("sale_id", id)
    .maybeSingle();

  if (item) {
    const { data: product } = await (supabase as any)
      .from("products")
      .select("stock")
      .eq("id", item.product_id)
      .single();

    if (product) {
      await (supabase as any)
        .from("products")
        .update({ stock: Number(product.stock) + Number(item.quantity) })
        .eq("id", item.product_id);
    }
  }

  await (supabase as any).from("stock_movements").delete().eq("reference_id", id).eq("movement_type", "sale");
  const { error } = await (supabase as any).from("sales").delete().eq("id", id);
  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "sales", entityId: id, action: "delete", userId: user.id });

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  redirect("/ventas?status=sale_deleted");
}
