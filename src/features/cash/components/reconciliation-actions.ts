"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCashData } from "@/features/cash/queries";
import { buildReconciliationAccounts, cashReconciliationSchema, type CashReconciliationRecord } from "./reconciliation-model";
import { cashReconciliationAmendmentSchema, cashReconciliationCorrectionSchema, getReconciliationChain, type CashReconciliationAmendment } from "./reconciliation-model";
import { readRecordPages } from "@/lib/read-record-pages";
import { createPaginationMeta, getPaginationRange } from "@/lib/pagination";

export async function loadCashReconciliationsAction(page = 1) {
  await requirePermission("cash.manage");
  const supabase = await createServerSupabaseClient();
  const range = getPaginationRange(Math.max(1, Math.trunc(page)), 20);
  const { data, error, count } = await (supabase as any).from("operations_cash_reconciliations")
    .select("id, business_date, accounts, observations, created_by, created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(range.from, range.to);
  if (error) return { ready: false, records: [] as CashReconciliationRecord[], message: ["42P01", "PGRST205"].includes(error.code) ? "Arqueo pendiente de migracion local / de prueba." : error.message };
  const records = (data ?? []) as CashReconciliationRecord[];
  let amendmentsReady = true;
  let message = "";
  if (records.length) {
    try {
      const amendments = await readRecordPages<CashReconciliationAmendment>((from, to) => (supabase as any).from("operations_cash_reconciliation_amendments")
        .select("*").in("root_id", records.map((record) => record.id)).order("id").range(from, to));
      for (const record of records) record.amendments = getReconciliationChain(record.id, amendments);
    } catch {
      amendmentsReady = false; message = "No se pudo verificar el historial de correcciones. Verifica la migracion incremental; no reabras sin historial completo.";
    }
  }
  return { ready: true, amendmentsReady, records, message, pagination: createPaginationMeta(count ?? 0, page, 20) };
}

export async function saveCashReconciliationAction(input: unknown) {
  const user = await requireAdmin();
  const parsed = cashReconciliationSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Arqueo invalido" };
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: readError } = await (supabase as any).from("operations_cash_reconciliations").select("id").eq("id", parsed.data.id).maybeSingle();
  if (readError) return { success: false, message: "No se pudo comprobar el arqueo. Verifica la migracion y reintenta." };
  if (existing) return { success: true, message: "Este cierre ya estaba registrado; no se duplico." };

  // Reuse the canonical calculations; no hidden form balance is authoritative.
  const current = await getCashData();
  if (current.today !== parsed.data.date) return { success: false, message: "Cambio el dia operativo. Actualiza caja antes de cerrar." };
  let accounts;
  try {
    accounts = buildReconciliationAccounts(current.balances, parsed.data.accounts);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo conciliar" };
  }
  const { error } = await (supabase as any).from("operations_cash_reconciliations").insert({
    id: parsed.data.id, business_date: current.today, accounts, observations: parsed.data.observations, created_by: user.id
  });
  if (error) return { success: false, message: error.code === "23505" ? "El dia ya tiene un cierre auditado. No se reemplazo ni se alteraron saldos." : error.message };
  revalidatePath("/caja");
  return { success: true, message: "Arqueo cerrado y auditado. Los saldos contables no cambiaron." };
}

async function appendCashAmendment(input: unknown, kind: "reopened" | "closed") {
  const user = await requireAdmin();
  const schema = kind === "reopened" ? cashReconciliationAmendmentSchema : cashReconciliationCorrectionSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Correccion invalida" };
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await (supabase as any).from("operations_cash_reconciliation_amendments")
    .select("id, root_id, kind").eq("id", parsed.data.id).maybeSingle();
  if (existingError) return { success: false, message: "No se pudo verificar la correccion; revisa la migracion incremental" };
  if (existing) return { success: existing.root_id === parsed.data.rootId && existing.kind === kind, message: "El identificador ya fue registrado. No se modifico ni duplico el evento." };
  const { data: root, error: rootError } = await (supabase as any).from("operations_cash_reconciliations")
    .select("id, accounts").eq("id", parsed.data.rootId).maybeSingle();
  if (rootError || !root) return { success: false, message: "No se encontro el cierre original" };
  let chain;
  try {
    const rows = await readRecordPages<CashReconciliationAmendment>((from, to) => (supabase as any).from("operations_cash_reconciliation_amendments")
      .select("*").eq("root_id", root.id).order("id").range(from, to));
    chain = getReconciliationChain(root.id, rows);
  } catch { return { success: false, message: "No se pudo verificar la cadena completa de correcciones" }; }
  const head = chain.at(-1);
  const headId = head?.id ?? root.id;
  if (headId !== parsed.data.expectedHeadId) return { success: false, message: "El arqueo cambio en otra pantalla. Actualiza antes de corregir." };
  if ((head?.kind ?? "closed") === kind) return { success: false, message: kind === "reopened" ? "El arqueo ya esta reabierto" : "Reabre el cierre antes de corregir el conteo" };
  const previousAccounts: CashReconciliationRecord["accounts"] = head?.accounts ?? root.accounts;
  let accounts = previousAccounts;
  if (kind === "closed") {
    const correction = cashReconciliationCorrectionSchema.parse(input);
    try { accounts = buildReconciliationAccounts(previousAccounts.map((account) => ({ method: account.method, balance: account.expected })), correction.accounts); }
    catch (error) { return { success: false, message: error instanceof Error ? error.message : "Conteo invalido" }; }
  }
  const { error } = await (supabase as any).from("operations_cash_reconciliation_amendments").insert({
    id: parsed.data.id, root_id: root.id, supersedes_id: head?.id ?? null, kind, reason: parsed.data.reason,
    accounts, observations: kind === "closed" ? cashReconciliationCorrectionSchema.parse(input).observations : "", created_by: user.id
  });
  if (error) return { success: false, message: error.code === "23505" ? "Otra pantalla ya registro la siguiente revision; actualiza el historial." : error.message };
  revalidatePath("/caja");
  return { success: true, message: kind === "reopened" ? "Reapertura auditada; el cierre original y los balances siguen intactos." : "Conteo corregido y cerrado como nueva revision inmutable. Los balances no cambiaron." };
}

export async function reopenCashReconciliationAction(input: unknown) { return appendCashAmendment(input, "reopened"); }
export async function closeCashReconciliationCorrectionAction(input: unknown) { return appendCashAmendment(input, "closed"); }
