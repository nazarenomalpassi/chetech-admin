"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/form-state";

const uuid = z.string().uuid("No se pudo identificar el registro.");
const cost = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.coerce.number().finite().min(0).max(9999999999).nullable(),
);
const base = {
  operationId: uuid,
  partId: uuid,
  version: z.coerce.number().int().positive(),
  extraCost: cost,
};
const createSchema = z.object({
  ...base,
  reason: z.string().trim().min(3, "Describe la falla del repuesto.").max(2000),
  quantity: z.coerce.number().int().min(1).max(10000),
  warrantyReturnId: uuid.or(z.literal("")).optional(),
});
const updateSchema = z
  .object({
    ...base,
    claimId: uuid,
    claimStatus: z.enum(["open", "sent", "resolved", "cancelled"]),
    resolution: z.string().trim().max(2000).default(""),
  })
  .refine(
    (p) =>
      !["resolved", "cancelled"].includes(p.claimStatus) ||
      p.resolution.length >= 3,
    {
      message: "Indica como se resolvio o por que se cancela el reclamo.",
      path: ["resolution"],
    },
  );

export async function saveSupplierClaim(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const input = Object.fromEntries(form.entries());
  const parsed = input.claimId
    ? updateSchema.safeParse(input)
    : createSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  const payload =
    "claimId" in p
      ? {
          status: p.claimStatus,
          resolution: p.resolution,
          ...(form.has("extraCost") ? { extra_cost: p.extraCost } : {}),
        }
      : {
          reason: p.reason,
          quantity: p.quantity,
          warranty_return_id: p.warrantyReturnId || null,
          extra_cost: p.extraCost,
        };
  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).rpc(
    "workshop_save_supplier_claim",
    {
      p_operation_id: p.operationId,
      p_part_id: p.partId,
      p_expected_version: p.version,
      p_claim_id: "claimId" in p ? p.claimId : null,
      p_payload: payload,
    },
  );
  if (error)
    return {
      success: false,
      message:
        error.code === "40001"
          ? "El registro cambio en otro dispositivo. Actualiza antes de reintentar; tus datos se conservan."
          : error.message ||
            "No se pudo guardar el reclamo. Reintenta con los mismos datos.",
    };
  revalidatePath("/reparaciones-access");
  revalidatePath("/pedidos");
  return {
    success: true,
    message:
      "Reclamo guardado. No se modificaron stock, cobros ni pagos de la orden.",
  };
}
