"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import {
  getBusinessGoalsKey,
  getRepairWarrantySettingsKey
} from "@/lib/app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const businessGoalsSchema = z.object({
  salesTarget: z.coerce.number().min(0, "La meta de ventas debe ser valida"),
  profitTarget: z.coerce.number().min(0, "La meta de ganancia debe ser valida"),
  repairsTarget: z.coerce.number().min(0, "La meta de reparaciones debe ser valida"),
  invoicingTarget: z.coerce.number().min(0, "La meta de facturacion debe ser valida")
});

const repairWarrantySettingsSchema = z.object({
  defaultDays: z.coerce
    .number()
    .int("La duracion debe expresarse en dias enteros")
    .min(1, "La duracion predeterminada debe ser mayor a cero")
    .max(3650, "La duracion predeterminada no puede superar los 10 anos")
});

function redirectWithError(message: string): never {
  redirect(`/configuracion?error=${encodeURIComponent(message)}`);
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

export async function saveRepairWarrantySettingsAction(formData: FormData) {
  const parsed = repairWarrantySettingsSchema.safeParse({
    defaultDays: formData.get("defaultDays")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo guardar la garantia");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const payload = { defaultDays: parsed.data.defaultDays };

  const { error } = await (supabase as any).from("app_settings").upsert(
    {
      key: getRepairWarrantySettingsKey(),
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
    entityId: getRepairWarrantySettingsKey(),
    action: "update",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/configuracion");
  revalidatePath("/reparaciones-access");
  redirect("/configuracion?status=warranty_settings_saved");
}
