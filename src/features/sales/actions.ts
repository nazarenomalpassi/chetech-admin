"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement, deleteStockMovement, replaceCashMovements, replaceStockMovements } from "@/lib/accounting";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getPaymentTotal, parsePaymentSplits } from "@/lib/payment-splits";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toOperationalDateTime } from "@/lib/utils";
import { getSaleValidationError } from "@/features/sales/validation";

const saleCartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive("Ingresa una cantidad valida"),
  unitPrice: z.coerce.number().min(0, "Ingresa un precio valido")
});

const saleFormSchema = z.object({
  id: z.string().uuid().optional(),
  saleDate: z.string().min(1, "Selecciona la fecha de la venta"),
  items: z.array(saleCartItemSchema).min(1, "Agrega al menos un producto"),
  payments: z
    .array(
      z.object({
        method: z.string().min(1, "Selecciona un medio de pago"),
        amount: z.coerce.number().positive("Ingresa un monto valido para cada pago")
      })
    )
    .min(1, "Agrega al menos un medio de pago"),
  notes: z.string().optional()
});

function parseCartItems(formData: FormData) {
  const rawItems = formData.get("itemsJson");

  if (rawItems) {
    try {
      return JSON.parse(String(rawItems));
    } catch {
      return [];
    }
  }

  return [
    {
      productId: formData.get("productId"),
      quantity: formData.get("quantity"),
      unitPrice: formData.get("unitPrice")
    }
  ];
}

function parsePayments(formData: FormData) {
  return parsePaymentSplits(formData.get("paymentsJson"));
}

function redirectWithError(message: string, id?: string): never {
  const params = new URLSearchParams({ error: message });
  if (id) params.set("edit", id);
  redirect(`/ventas?${params.toString()}`);
}

async function getNextSaleNumber(supabase: any) {
  const { count } = await supabase.from("sales").select("*", { count: "exact", head: true });
  return `V-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

function addQuantity(map: Map<string, number>, productId: string, quantity: number) {
  map.set(productId, (map.get(productId) ?? 0) + quantity);
}

export async function saveSaleAction(formData: FormData) {
  const parsed = saleFormSchema.safeParse({
    id: formData.get("id") || undefined,
    saleDate: formData.get("saleDate"),
    items: parseCartItems(formData),
    payments: parsePayments(formData),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la venta", String(formData.get("id") ?? ""));
  }

  const supabase = await createServerSupabaseClient();
  const input = parsed.data;
  const user = input.id ? await requireAdmin() : await requireUser();
  const productIds = Array.from(new Set(input.items.map((item) => item.productId)));

  const { data: products, error: productsError } = await (supabase as any)
    .from("products")
    .select("id, name, stock, cost")
    .in("id", productIds);

  if (productsError || !products || products.length !== productIds.length) {
    redirectWithError("No se encontraron todos los productos seleccionados.", input.id);
  }

  const productsById = new Map<string, any>((products ?? []).map((product: any) => [product.id, product]));

  const oldItemsResult = input.id
    ? await (supabase as any)
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", input.id)
    : { data: [], error: null };

  if (oldItemsResult.error) {
    redirectWithError(oldItemsResult.error.message, input.id);
  }

  const oldQuantitiesByProduct = new Map<string, number>();
  for (const item of oldItemsResult.data ?? []) {
    addQuantity(oldQuantitiesByProduct, item.product_id, Number(item.quantity));
  }

  const newQuantitiesByProduct = new Map<string, number>();
  for (const item of input.items) {
    addQuantity(newQuantitiesByProduct, item.productId, item.quantity);
  }

  for (const [productId, quantity] of newQuantitiesByProduct) {
    const product = productsById.get(productId);
    const availableStock = Number(product.stock) + (oldQuantitiesByProduct.get(productId) ?? 0);

    if (availableStock < quantity) {
      redirectWithError(`Stock insuficiente para ${product.name}. Disponible: ${availableStock}.`, input.id);
    }
  }

  const subtotal = input.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const paymentTotal = getPaymentTotal(input.payments);
  const paymentErrorMessage = getSaleValidationError({
    itemCount: input.items.length,
    totalAmount: subtotal,
    payments: input.payments
  });
  if (paymentErrorMessage) redirectWithError(paymentErrorMessage, input.id);

  const costTotal = input.items.reduce((acc, item) => {
    const product = productsById.get(item.productId);
    return acc + Number(product.cost) * item.quantity;
  }, 0);
  const profitTotal = subtotal - costTotal;

  let saleId = input.id;
  let action: "insert" | "update" = "update";

  if (saleId) {
    const { error } = await (supabase as any)
      .from("sales")
      .update({
        subtotal,
        cost_total: costTotal,
        profit_total: profitTotal,
        notes: input.notes || null,
        sold_at: toOperationalDateTime(input.saleDate)
      })
      .eq("id", saleId);

    if (error) redirectWithError(error.message, saleId);
  } else {
    action = "insert";
    const { data, error } = await (supabase as any)
      .from("sales")
      .insert({
        sale_number: await getNextSaleNumber(supabase as any),
        subtotal,
        cost_total: costTotal,
        profit_total: profitTotal,
        notes: input.notes || null,
        sold_at: toOperationalDateTime(input.saleDate),
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

  const saleItems = input.items.map((item) => {
    const product = productsById.get(item.productId);
    return {
      sale_id: saleId,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      unit_cost: Number(product.cost),
      total: item.quantity * item.unitPrice
    };
  });

  const { error: itemError } = await (supabase as any).from("sale_items").insert(saleItems);
  if (itemError) redirectWithError(itemError.message, saleId);

  const { error: paymentError } = await (supabase as any).from("sale_payments").insert(
    input.payments.map((payment) => ({
      sale_id: saleId,
      method: payment.method,
      amount: payment.amount
    }))
  );

  if (paymentError) redirectWithError(paymentError.message, saleId);

  await (supabase as any).from("stock_movements").insert(
    input.items.map((item) => ({
      product_id: item.productId,
      movement_type: "sale",
      quantity: -item.quantity,
      reference_id: saleId,
      notes: input.notes || "Venta manual"
    }))
  );

  const stockProductIds = Array.from(new Set([...oldQuantitiesByProduct.keys(), ...newQuantitiesByProduct.keys()]));
  for (const productId of stockProductIds) {
    const product = productsById.get(productId);
    const currentStock = product
      ? Number(product.stock)
      : Number((await (supabase as any).from("products").select("stock").eq("id", productId).single()).data?.stock ?? 0);
    const restoredStock = currentStock + (oldQuantitiesByProduct.get(productId) ?? 0);
    const newStock = restoredStock - (newQuantitiesByProduct.get(productId) ?? 0);
    await (supabase as any).from("products").update({ stock: newStock }).eq("id", productId);
  }

  await replaceCashMovements(supabase as any, {
    tipo: "venta",
    movimientos: input.payments.map((payment) => ({
      monto: payment.amount,
      medioPago: payment.method,
      descripcion: `Venta ${saleId}`
    })),
    referenciaTabla: "sales",
    referenciaId: saleId!,
    userId: user.id,
    fecha: input.saleDate
  });

  await replaceStockMovements(supabase as any, {
    movimientos: input.items.map((item) => ({
      productoId: item.productId,
      tipo: "salida",
      cantidad: item.quantity,
      descripcion: input.notes || "Venta manual"
    })),
    referenciaTabla: "sales",
    referenciaId: saleId!,
    userId: user.id
  });

  await createAuditLog({
    entityType: "sales",
    entityId: saleId!,
    action,
    userId: user.id,
    changes: { ...input, paymentTotal }
  });

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect(`/ventas?status=${action === "insert" ? "sale_created" : "sale_updated"}`);
}

export async function deleteSaleAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();

  const { data: items } = await (supabase as any)
    .from("sale_items")
    .select("product_id, quantity")
    .eq("sale_id", id);

  for (const item of items ?? []) {
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
  await deleteStockMovement(supabase as any, "sales", id);
  await deleteCashMovement(supabase as any, "sales", id);
  const { error } = await (supabase as any).from("sales").delete().eq("id", id);
  if (error) redirectWithError(error.message);

  await createAuditLog({ entityType: "sales", entityId: id, action: "delete", userId: user.id });

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/ventas?status=sale_deleted");
}
