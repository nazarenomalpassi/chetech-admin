"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { productSchema } from "@/features/products/schemas";

export async function upsertProductAction(input: unknown) {
  const parsed = productSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "No se pudo validar el producto"
    };
  }

  const supabase = await createServerSupabaseClient();
  const payload = {
    name: parsed.data.name,
    category_id: parsed.data.categoryId ?? null,
    cost: parsed.data.cost,
    sale_price: parsed.data.salePrice,
    stock: parsed.data.stock,
    min_stock: parsed.data.minStock,
    is_active: parsed.data.isActive,
    notes: parsed.data.notes ?? null
  };

  if (!parsed.data.id && !parsed.data.categoryId) {
    return {
      success: false,
      message: "Seleccioná una categoría para generar el SKU automáticamente"
    };
  }

  const { data, error } = parsed.data.id
    ? await (supabase as any).from("products").update(payload).eq("id", parsed.data.id).select("id, sku").single()
    : await (supabase as any)
        .rpc("create_product_with_generated_sku", {
          p_name: parsed.data.name,
          p_category_id: parsed.data.categoryId,
          p_cost: parsed.data.cost,
          p_sale_price: parsed.data.salePrice,
          p_stock: parsed.data.stock,
          p_min_stock: parsed.data.minStock,
          p_is_active: parsed.data.isActive,
          p_notes: parsed.data.notes ?? null
        })
        .single();

  if (error) {
    return {
      success: false,
      message: error.message
    };
  }

  await createAuditLog({
    entityType: "products",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    changes: payload
  });

  revalidatePath("/productos");

  return {
    success: true,
    message: parsed.data.id ? "Producto actualizado" : `Producto creado con SKU ${data.sku}`
  };
}

export async function toggleProductStatusAction(id: string, nextValue: boolean) {
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from("products").update({ is_active: nextValue }).eq("id", id);

  if (error) {
    return {
      success: false,
      message: error.message
    };
  }

  await createAuditLog({
    entityType: "products",
    entityId: id,
    action: "update",
    changes: { is_active: nextValue }
  });

  revalidatePath("/productos");

  return {
    success: true,
    message: nextValue ? "Producto reactivado" : "Producto desactivado"
  };
}
