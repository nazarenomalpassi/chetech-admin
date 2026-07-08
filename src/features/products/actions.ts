"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { normalizeSearchText } from "@/lib/search";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { categorySchema, productSchema } from "@/features/products/schemas";

function slugifyCategoryName(name: string) {
  return normalizeSearchText(name).replace(/\s+/g, "_");
}

export async function upsertProductAction(input: unknown) {
  await requireAdmin();
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
      message: "Selecciona una categoria para generar el SKU automaticamente"
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
  await requireAdmin();
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

export async function deleteProductAction(id: string) {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from("products").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      message:
        error.code === "23503"
          ? "No se puede eliminar porque el producto ya tiene movimientos o ventas. Podes desactivarlo."
          : error.message
    };
  }

  await createAuditLog({
    entityType: "products",
    entityId: id,
    action: "delete"
  });

  revalidatePath("/productos");

  return {
    success: true,
    message: "Producto eliminado"
  };
}

export async function createCategoryAction(input: unknown) {
  await requireAdmin();
  const parsed = categorySchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "No se pudo validar la categoria"
    };
  }

  const supabase = await createServerSupabaseClient();
  const payload = {
    name: parsed.data.name.trim(),
    slug: slugifyCategoryName(parsed.data.name),
    sku_prefix: parsed.data.skuPrefix.trim()
  };

  const { data, error } = await (supabase as any)
    .from("categories")
    .insert(payload)
    .select("id, name")
    .single();

  if (error) {
    return {
      success: false,
      message:
        error.code === "23505"
          ? "Ya existe una categoria o prefijo SKU con ese valor"
          : error.message
    };
  }

  await createAuditLog({
    entityType: "categories",
    entityId: data.id,
    action: "insert",
    changes: payload
  });

  revalidatePath("/productos");

  return {
    success: true,
    message: `Categoria ${data.name} creada`
  };
}
