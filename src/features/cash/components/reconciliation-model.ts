import { z } from "zod";
import { CASH_METHODS } from "@/lib/cash";
import { operationDateSchema } from "@/features/visits/schemas";

const amount = z.number().finite().min(-9999999999.99).max(9999999999.99);
export const cashReconciliationSchema = z.object({
  id: z.string().uuid(),
  date: operationDateSchema,
  observations: z.string().trim().max(2000).default(""),
  accounts: z.array(z.object({
    method: z.enum(CASH_METHODS),
    expected: amount,
    physical: amount.min(0, "El saldo contado no puede ser negativo"),
    reason: z.string().trim().max(1000).default("")
  })).length(3).refine((accounts) => new Set(accounts.map((account) => account.method)).size === 3, "Conta las tres cuentas una sola vez")
});

export type ReconciliationAccount = z.infer<typeof cashReconciliationSchema>["accounts"][number] & { difference: number };
export type CashReconciliationRecord = {
  id: string; business_date: string; accounts: ReconciliationAccount[]; observations: string; created_by: string; created_at: string;
  amendments?: CashReconciliationAmendment[];
};

export const cashReconciliationAmendmentSchema = z.object({
  id: z.string().uuid(), rootId: z.string().uuid(), expectedHeadId: z.string().uuid(),
  reason: z.string().trim().min(3, "Explica el motivo de la reapertura o correccion").max(2000)
});
export const cashReconciliationCorrectionSchema = cashReconciliationAmendmentSchema.extend({
  accounts: cashReconciliationSchema.shape.accounts,
  observations: z.string().trim().max(2000).default("")
});
export type CashReconciliationAmendment = {
  id: string; root_id: string; supersedes_id: string | null; kind: "reopened" | "closed";
  reason: string; accounts: ReconciliationAccount[]; observations: string; created_by: string; created_at: string;
};

export function getReconciliationChain<T extends { id: string; root_id: string; supersedes_id: string | null }>(rootId: string, rows: T[]) {
  const chain: T[] = [];
  let head: string | null = null;
  const selected = rows.filter((row) => row.root_id === rootId);
  const seen = new Set<string>();
  for (;;) {
    const successors = selected.filter((row) => row.supersedes_id === head);
    if (!successors.length) break;
    if (successors.length !== 1 || seen.has(successors[0].id)) throw new Error("Cadena de arqueo inconsistente; no se puede corregir");
    const next = successors[0]; chain.push(next); seen.add(next.id); head = next.id;
  }
  if (chain.length !== selected.length) throw new Error("Historial de arqueo incompleto");
  return chain;
}

export function buildReconciliationAccounts(balances: Array<{ method: string; balance: number }>, counts: Array<{ method: string; expected: number; physical: number; reason: string }>): ReconciliationAccount[] {
  return CASH_METHODS.map((method) => {
    const current = balances.find((balance) => balance.method === method);
    const count = counts.find((account) => account.method === method);
    if (!current || !count || Math.round(current.balance * 100) !== Math.round(count.expected * 100)) {
      throw new Error("El saldo esperado cambio. Actualiza caja y verifica el arqueo antes de cerrar.");
    }
    const expected = Math.round(current.balance * 100) / 100;
    const physical = Math.round(count.physical * 100) / 100;
    const difference = (Math.round(physical * 100) - Math.round(expected * 100)) / 100;
    if (difference !== 0 && count.reason.trim().length < 3) throw new Error(`Justifica la diferencia de ${method}.`);
    return { method, expected, physical, difference, reason: count.reason.trim() };
  });
}
