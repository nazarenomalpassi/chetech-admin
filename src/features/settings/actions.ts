"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { getBusinessGoalsKey, getCashSettingsKey } from "@/lib/app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toOperationalDateTime } from "@/lib/utils";

const cashSettingsSchema = z.object({
  openingEfectivo: z.coerce.number().min(0, "El saldo inicial de EFECTIVO debe ser valido"),
  openingNx: z.coerce.number().min(0, "El saldo inicial de NX SANTI debe ser valido"),
  openingMp: z.coerce.number().min(0, "El saldo inicial de NX LOCAL debe ser valido"),
  movementCutoff: z.string().min(1, "Selecciona la fecha base de caja")
});

const businessGoalsSchema = z.object({
  salesTarget: z.coerce.number().min(0, "La meta de ventas debe ser valida"),
  profitTarget: z.coerce.number().min(0, "La meta de ganancia debe ser valida"),
  repairsTarget: z.coerce.number().min(0, "La meta de reparaciones debe ser valida"),
  invoicingTarget: z.coerce.number().min(0, "La meta de facturacion debe ser valida")
});

function redirectWithError(message: string): never {
  redirect(`/configuracion?error=${encodeURIComponent(message)}`);
}

export async function saveCashSettingsAction(formData: FormData) {
  const parsed = cashSettingsSchema.safeParse({
    openingEfectivo: formData.get("openingEfectivo"),
    openingNx: formData.get("openingNx"),
    openingMp: formData.get("openingMp"),
    movementCutoff: formData.get("movementCutoff")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudieron guardar los ajustes");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const payload = {
    openingBalances: {
      efectivo: parsed.data.openingEfectivo,
      nx: parsed.data.openingNx,
      mp: parsed.data.openingMp
    },
    movementCutoff: toOperationalDateTime(parsed.data.movementCutoff)
  };

  const { error } = await (supabase as any).from("app_settings").upsert(
    {
      key: getCashSettingsKey(),
      value: payload,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    redirectWithError(error.message);
  }

  await createAuditLog({
    entityType: "app_settings",
    entityId: getCashSettingsKey(),
    action: "update",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/configuracion");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/configuracion?status=settings_saved");
}

export async function saveBusinessGoalsAction(formData: FormData) {
  const parsed = businessGoalsSchema.safeParse({
    salesTarget: formData.get("salesTarget"),
    profitTarget: formData.get("profitTarget"),
    repairsTarget: formData.get("repairsTarget"),
    invoicingTarget: formData.get("invoicingTarget")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudieron guardar las metas");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const payload = {
    salesTarget: parsed.data.salesTarget,
    profitTarget: parsed.data.profitTarget,
    repairsTarget: parsed.data.repairsTarget,
    invoicingTarget: parsed.data.invoicingTarget
  };

  const { error } = await (supabase as any).from("app_settings").upsert(
    {
      key: getBusinessGoalsKey(),
      value: payload,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );

  if (error) {
    redirectWithError(error.message);
  }

  await createAuditLog({
    entityType: "app_settings",
    entityId: getBusinessGoalsKey(),
    action: "update",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/configuracion");
  revalidatePath("/reportes");
  redirect("/configuracion?status=goals_saved");
}
