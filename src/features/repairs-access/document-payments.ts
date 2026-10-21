import { z } from "zod";

export type DocumentPayment = { id: string; method: string; amount: number; date: string | null };
export type DocumentPaymentSnapshot = { payments: DocumentPayment[]; finalTotal: number | null };

// One PostgREST statement gives the order and both ledgers the same database snapshot.
// Existing RLS and the route's admin check remain authoritative.
export const DELIVERY_DOCUMENT_SELECT = `*,
  repair_access_customers(*),repair_access_devices(*),
  repairs!repair_access_order_id(id,final_price,estimated_price,repair_payments(id,method,amount,payment_date,created_at)),
  repair_access_payments(id,method,amount,payment_date,created_at,legacy_repair_payment_id,voided_at)`;

const money = z.union([z.number(), z.string().min(1)]).pipe(z.coerce.number().finite().nonnegative());
const payment = z.object({ id: z.string().min(1), method: z.string().nullable(), amount: money,
  payment_date: z.string().nullable(), created_at: z.string().nullable() });
const snapshotSchema = z.object({
  repairs: z.array(z.object({ final_price: money.nullable().optional(), estimated_price: money.nullable().optional(), repair_payments: z.array(payment) })).max(1),
  repair_access_payments: z.array(payment.extend({ legacy_repair_payment_id: z.string().nullable(), voided_at: z.string().nullable() }))
});

export function readDocumentPayments(raw: unknown): DocumentPaymentSnapshot {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Revisa los registros de cobro de esta orden antes de emitir el comprobante.");
  const { repairs, repair_access_payments: native } = parsed.data;
  const rows = [
    ...(repairs[0]?.repair_payments ?? []).map((row) => ({ ...row, id: `repair:${row.id}` })),
    ...native.filter((row) => !row.voided_at && !row.legacy_repair_payment_id).map((row) => ({ ...row, id: `access:${row.id}` }))
  ];
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Hay cobros duplicados para revisar en esta orden.");
  return {
    finalTotal: repairs[0]?.final_price ?? repairs[0]?.estimated_price ?? null,
    payments: rows.map((row) => ({ id: row.id, method: row.method || "Sin medio registrado", amount: row.amount, date: row.payment_date || null }))
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id))
  };
}
