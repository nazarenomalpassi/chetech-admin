"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tvBoardBoxSchema } from "@/features/tv-boards/schemas";

type BoxResult = { success: boolean; message: string; number?: number };

const missingTableMessage =
  "Las cajas todavía no están habilitadas en la base de datos. Avisá a la administración.";

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";
}

/** Crea una caja con el número siguiente; la base asigna el número para que no se repita. */
export async function createTvBoardBoxAction(input: unknown): Promise<BoxResult> {
  const user = await requireAdmin();
  const parsed = tvBoardBoxSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("create_tv_board_box", {
    p_label: parsed.data.label
  });
  if (error) {
    return { success: false, message: isMissingTable(error) ? missingTableMessage : error.message };
  }
  const created = (Array.isArray(data) ? data[0] : data) as { id: string; number: number } | null;
  if (!created) return { success: false, message: "No se pudo crear la caja. Probá de nuevo." };

  await createAuditLog({
    entityType: "tv_board_boxes",
    entityId: created.id,
    action: "insert",
    userId: user.id,
    changes: { number: created.number, label: parsed.data.label }
  });
  revalidatePath("/placas-tv");
  return { success: true, message: `Caja ${created.number} creada`, number: created.number };
}

export async function updateTvBoardBoxAction(input: unknown): Promise<BoxResult> {
  const user = await requireAdmin();
  const parsed = tvBoardBoxSchema.safeParse(input);
  if (!parsed.success || !parsed.data.id) {
    return { success: false, message: "No se pudo identificar la caja." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("tv_board_boxes")
    .update({ label: parsed.data.label, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id,number")
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "La caja ya no existe. Actualizá la página." };

  await createAuditLog({
    entityType: "tv_board_boxes",
    entityId: data.id,
    action: "update",
    userId: user.id,
    changes: { label: parsed.data.label }
  });
  revalidatePath("/placas-tv");
  return { success: true, message: `Caja ${data.number} actualizada`, number: data.number };
}

/** Solo se elimina una caja vacía: ninguna placa sin vender puede quedar sin ubicación. */
export async function deleteTvBoardBoxAction(id: string): Promise<BoxResult> {
  const user = await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, message: "No se pudo identificar la caja." };
  }
  const supabase = await createServerSupabaseClient();

  const { count, error: countError } = await (supabase as any)
    .from("tv_boards")
    .select("id", { count: "exact", head: true })
    .eq("box_id", id)
    .is("sold_at", null);
  if (countError) return { success: false, message: countError.message };
  if (count) {
    return {
      success: false,
      message:
        count === 1
          ? "La caja tiene 1 placa. Movela a otra caja antes de eliminarla."
          : `La caja tiene ${count} placas. Movelas a otra caja antes de eliminarla.`
    };
  }

  const { data, error } = await (supabase as any)
    .from("tv_board_boxes")
    .delete()
    .eq("id", id)
    .select("id,number")
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "La caja ya no existe. Actualizá la página." };

  await createAuditLog({
    entityType: "tv_board_boxes",
    entityId: id,
    action: "delete",
    userId: user.id,
    changes: { number: data.number }
  });
  revalidatePath("/placas-tv");
  return { success: true, message: `Caja ${data.number} eliminada` };
}
