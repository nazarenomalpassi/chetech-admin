"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { balanceTransferSchema, voidBalanceTransferSchema } from "@/features/balance-transfers/schemas";
import { createAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/cambio-balance?${params.toString()}` as Route);
}

function revalidateBalanceTransferPaths() {
  revalidatePath("/cambio-balance");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
}

export async function saveBalanceTransferAction(formData: FormData) {
  const parsed = balanceTransferSchema.safeParse({
    fromPaymentMethod: formData.get("fromPaymentMethod"),
    toPaymentMethod: formData.get("toPaymentMethod"),
    amount: formData.get("amount"),
    transferDate: formData.get("transferDate"),
    description: formData.get("description")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el cambio de balance.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const payload = {
    from_payment_method: parsed.data.fromPaymentMethod,
    to_payment_method: parsed.data.toPaymentMethod,
    amount: parsed.data.amount,
    description: parsed.data.description || null,
    transfer_date: parsed.data.transferDate,
    created_by: user.id
  };

  const { data, error } = await (supabase as any).from("balance_transfers").insert(payload).select("id").single();

  if (error || !data) {
    redirectWithError(error?.message ?? "No se pudo guardar el cambio de balance.");
  }

  await createAuditLog({
    entityType: "balance_transfers",
    entityId: data.id,
    action: "insert",
    userId: user.id,
    changes: payload
  });

  revalidateBalanceTransferPaths();
  redirect("/cambio-balance?status=balance_transfer_created" as Route);
}

export async function voidBalanceTransferAction(formData: FormData) {
  const parsed = voidBalanceTransferSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la anulacion.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("void_balance_transfer", {
    p_reason: parsed.data.reason || null,
    p_transfer_id: parsed.data.id
  });

  if (error) {
    redirectWithError(error.message);
  }

  await createAuditLog({
    entityType: "balance_transfers",
    entityId: parsed.data.id,
    action: "update",
    userId: user.id,
    changes: {
      voidReason: parsed.data.reason ?? null,
      reversalTransferId: data
    }
  });

  revalidateBalanceTransferPaths();
  redirect("/cambio-balance?status=balance_transfer_voided" as Route);
}
