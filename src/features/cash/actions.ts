"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const closeCashSchema = z.object({
  date: z.string().min(1),
  openingBalance: z.coerce.number().min(0),
  income: z.coerce.number().min(0),
  outcome: z.coerce.number().min(0),
  finalBalance: z.coerce.number().min(0),
  observations: z.string().optional()
});

function redirectWithError(message: string): never {
  redirect(`/caja?error=${encodeURIComponent(message)}`);
}

export async function closeCashAction(formData: FormData) {
  const parsed = closeCashSchema.safeParse({
    date: formData.get("date"),
    openingBalance: formData.get("openingBalance"),
    income: formData.get("income"),
    outcome: formData.get("outcome"),
    finalBalance: formData.get("finalBalance"),
    observations: formData.get("observations")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el cierre de caja");
  }

  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const input = parsed.data;

  const { data, error } = await (supabase as any)
    .from("cierres_caja")
    .upsert(
      {
        fecha: input.date,
        saldo_inicial: input.openingBalance,
        ingresos: input.income,
        egresos: input.outcome,
        saldo_final: input.finalBalance,
        observaciones: input.observations || null,
        created_by: user.id
      },
      { onConflict: "fecha" }
    )
    .select("id")
    .single();

  if (error || !data) {
    redirectWithError(error?.message ?? "No se pudo guardar el cierre de caja");
  }

  await createAuditLog({
    entityType: "cierres_caja",
    entityId: data.id,
    action: "insert",
    userId: user.id,
    changes: input
  });

  revalidatePath("/caja");
  redirect("/caja?status=cash_closed");
}
