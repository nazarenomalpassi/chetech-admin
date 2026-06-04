"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tvBoardSaleSchema, tvBoardSchema } from "@/features/tv-boards/schemas";

export async function upsertTvBoardAction(input: unknown) {
  await requireAdmin();
  const parsed = tvBoardSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "No se pudo validar la placa"
    };
  }

  const supabase = await createServerSupabaseClient();
  let soldLocked = false;

  if (parsed.data.id) {
    const { data: currentBoard, error: currentBoardError } = await (supabase as any)
      .from("tv_boards")
      .select("sold_at")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (currentBoardError) {
      return {
        success: false,
        message: currentBoardError.message
      };
    }

    soldLocked = Boolean(currentBoard?.sold_at);
  }

  const payload = {
    brand: parsed.data.brand,
    model: parsed.data.model,
    board_type: parsed.data.boardType,
    listed_price: parsed.data.price,
    is_active: soldLocked ? false : parsed.data.isActive
  };

  const { data, error } = parsed.data.id
    ? await (supabase as any).from("tv_boards").update(payload).eq("id", parsed.data.id).select("id").single()
    : await (supabase as any).from("tv_boards").insert(payload).select("id").single();

  if (error) {
    return {
      success: false,
      message: error.message
    };
  }

  await createAuditLog({
    entityType: "tv_boards",
    entityId: data.id,
    action: parsed.data.id ? "update" : "insert",
    changes: payload
  });

  revalidatePath("/placas-tv");

  return {
    success: true,
    message: parsed.data.id ? "Placa actualizada" : "Placa creada"
  };
}

export async function toggleTvBoardStatusAction(id: string, nextValue: boolean) {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { data: board, error: boardError } = await (supabase as any)
    .from("tv_boards")
    .select("sold_at")
    .eq("id", id)
    .maybeSingle();

  if (boardError) {
    return {
      success: false,
      message: boardError.message
    };
  }

  if (board?.sold_at) {
    return {
      success: false,
      message: "La placa ya esta vendida y no puede volver al stock disponible"
    };
  }

  const { error } = await (supabase as any).from("tv_boards").update({ is_active: nextValue }).eq("id", id);

  if (error) {
    return {
      success: false,
      message: error.message
    };
  }

  await createAuditLog({
    entityType: "tv_boards",
    entityId: id,
    action: "update",
    changes: { is_active: nextValue }
  });

  revalidatePath("/placas-tv");

  return {
    success: true,
    message: nextValue ? "Placa reactivada" : "Placa dada de baja"
  };
}

export async function deleteTvBoardAction(id: string) {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from("tv_boards").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      message: error.message
    };
  }

  await createAuditLog({
    entityType: "tv_boards",
    entityId: id,
    action: "delete"
  });

  revalidatePath("/placas-tv");

  return {
    success: true,
    message: "Placa eliminada"
  };
}

export async function markTvBoardSoldAction(input: unknown) {
  await requireAdmin();
  const parsed = tvBoardSaleSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "No se pudo validar la venta de la placa"
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: currentBoard, error: currentBoardError } = await (supabase as any)
    .from("tv_boards")
    .select("id, brand, model, sold_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (currentBoardError) {
    return {
      success: false,
      message: currentBoardError.message
    };
  }

  if (!currentBoard) {
    return {
      success: false,
      message: "No encontramos la placa que queres marcar como vendida"
    };
  }

  if (currentBoard.sold_at) {
    return {
      success: false,
      message: "La placa ya estaba marcada como vendida"
    };
  }

  const salePayload = {
    sold_at: new Date().toISOString(),
    mercado_libre_net_amount: parsed.data.netAmount,
    release_date: parsed.data.releaseDate,
    sale_notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
    is_active: false
  };

  const { error } = await (supabase as any).from("tv_boards").update(salePayload).eq("id", parsed.data.id);

  if (error) {
    return {
      success: false,
      message: error.message
    };
  }

  await createAuditLog({
    entityType: "tv_boards",
    entityId: parsed.data.id,
    action: "update",
    changes: salePayload
  });

  revalidatePath("/placas-tv");

  return {
    success: true,
    message: `Venta cargada para ${currentBoard.brand} ${currentBoard.model}`
  };
}
