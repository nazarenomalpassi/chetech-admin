"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/form-state";

export async function startWarrantyObservation(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (form.get("confirmObservation") !== "on")
    return {
      success: false,
      message:
        "Confirma que desde hoy se registraran todos los reingresos en el sistema.",
    };
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc(
    "start_workshop_warranty_observation",
  );
  if (error)
    return {
      success: false,
      message:
        "No se pudo iniciar el seguimiento. Reintenta; no se cambiaron las ordenes.",
    };
  revalidatePath("/reparaciones-access");
  return {
    success: true,
    message:
      "Seguimiento iniciado desde hoy. Las tasas apareceran cuando existan garantias completas y vencidas para comparar.",
  };
}
