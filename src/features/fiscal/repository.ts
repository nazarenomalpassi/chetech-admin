import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FiscalRepository } from "./issuance";
import type { FiscalRecord } from "./model";

export function mapFiscalRecord(row: any): FiscalRecord {
  return { id: row.id, invoiceId: row.invoice_id, status: row.status, snapshot: row.snapshot,
    snapshotHash: row.snapshot_hash, number: row.voucher_number === null ? null : Number(row.voucher_number),
    authorization: row.cae_authorization, errorCodes: row.error_codes ?? [] };
}
export const FISCAL_SAFE_COLUMNS = "id,invoice_id,status,snapshot,snapshot_hash,voucher_number,cae_authorization,error_codes,environment,created_at";
// New fiscal tables are intentionally isolated from the generated legacy Database type.
export type FiscalReadClient = { from: (table: any) => any };

export function createFiscalServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Registro fiscal del servidor no configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function createFiscalRepository(client: SupabaseClient): FiscalRepository {
  const rpc = async (name: string, input: unknown) => {
    const { data, error } = await client.rpc(name, { p_input: input });
    if (error || !data) throw new Error("No se pudo reclamar/finalizar el registro fiscal. Hay una operacion pendiente, datos modificados o falta la migracion.");
    return data;
  };
  return {
    claim: (input) => rpc("fiscal_claim", input),
    prepare: (id, token, number) => rpc("fiscal_prepare", { id, token, number }),
    async markSubmitting(id, token) { await rpc("fiscal_mark_submitting", { id, token }); },
    finish: (id, token, outcome) => rpc("fiscal_finish", { id, token, outcome })
  };
}
