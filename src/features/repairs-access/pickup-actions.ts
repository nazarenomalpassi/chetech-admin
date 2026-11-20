"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { registerPickupForPaidOrder } from "./pickup-server";

export type BulkPickupResult = {
  success: boolean;
  message: string;
  done: number;
  failed: Array<{ repairNumber: string; message: string }>;
};

const idsSchema = z
  .array(z.string().uuid())
  .min(1, "Elegí al menos una orden.")
  .max(200, "Marcá hasta 200 órdenes por vez.");

/**
 * Marca como retiradas órdenes ya cobradas que quedaron sin entrega registrada.
 * Cada una pasa por `workshop_deliver`, igual que "Registrar entrega": se revisa que
 * siga cobrada y lista, y queda en el historial y la auditoría.
 */
export async function markPaidOrdersPickedUpAction(orderIds: string[]): Promise<BulkPickupResult> {
  await requireAdmin();
  const parsed = idsSchema.safeParse(Array.from(new Set(orderIds)));
  if (!parsed.success)
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisá la selección.",
      done: 0,
      failed: []
    };
  const supabase = await createServerSupabaseClient();
  let done = 0;
  const failed: BulkPickupResult["failed"] = [];
  for (const id of parsed.data) {
    try {
      const result = await registerPickupForPaidOrder(
        supabase,
        id,
        "Retiro marcado desde Cobros: la orden estaba cobrada y sin retiro registrado."
      );
      if (result.success) done++;
      else failed.push({ repairNumber: result.repairNumber ?? "Orden", message: result.message });
    } catch {
      failed.push({ repairNumber: "Orden", message: "No se pudo registrar el retiro." });
    }
  }
  if (done) {
    for (const path of ["/reparaciones", "/reparaciones-access", "/dashboard"])
      revalidatePath(path);
  }
  const marked =
    done === 1 ? "1 orden marcada como retirada." : `${done} órdenes marcadas como retiradas.`;
  return {
    success: failed.length === 0,
    message: failed.length
      ? `${marked} ${failed.length === 1 ? "1 no se pudo marcar" : `${failed.length} no se pudieron marcar`}.`
      : marked,
    done,
    failed
  };
}
