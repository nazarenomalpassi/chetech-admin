import { createHash } from "node:crypto";
import type { FiscalAuthorization, FiscalRecord, FiscalSnapshot } from "./model";

export function snapshotHash(snapshot: FiscalSnapshot) {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  return createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}
export type FiscalClaimInput = { requestId: string; userId: string; snapshot: FiscalSnapshot; snapshotHash: string };
export type FiscalOutcome = { status: "accepted" | "uncertain" | "rejected"; authorization?: FiscalAuthorization; codes?: number[] };
export interface FiscalRepository {
  claim(input: FiscalClaimInput): Promise<{ kind: "accepted" | "busy"; record: FiscalRecord } | { kind: "acquired"; record: FiscalRecord; token: string }>;
  prepare(id: string, token: string, number: number): Promise<FiscalRecord>;
  markSubmitting(id: string, token: string): Promise<void>;
  finish(id: string, token: string, outcome: FiscalOutcome): Promise<FiscalRecord>;
}
export interface FiscalGateway {
  check(snapshot: FiscalSnapshot): Promise<void>;
  last(snapshot: FiscalSnapshot): Promise<number>;
  consult(snapshot: FiscalSnapshot, number: number, reference: string): Promise<FiscalAuthorization | null>;
  authorize(snapshot: FiscalSnapshot, number: number, reference: string): Promise<{ kind: "accepted"; authorization: FiscalAuthorization } | { kind: "rejected"; codes: number[] }>;
}

export async function issueFiscalInvoice(repository: FiscalRepository, gateway: FiscalGateway, input: FiscalClaimInput) {
  const claim = await repository.claim(input);
  if (claim.kind !== "acquired") return claim.record;
  let record = claim.record;
  const s = record.snapshot;
  const recovering = record.number !== null;
  try {
    if (record.number === null) {
      await gateway.check(s);
      const last = await gateway.last(s);
      if (last >= 99999999) throw new Error("Numeracion agotada.");
      record = await repository.prepare(record.id, claim.token, last + 1);
    }
    const number = record.number!;
    const recovered = await gateway.consult(s, number, record.id);
    if (recovered) return await repository.finish(record.id, claim.token, { status: "accepted", authorization: recovered });
    if (recovering) await gateway.check(s);
    if (await gateway.last(s) !== number - 1) throw new Error("Serie divergente; requiere conciliacion.");
    await repository.markSubmitting(record.id, claim.token);
    const result = await gateway.authorize(s, number, record.id);
    if (result.kind === "accepted") return await repository.finish(record.id, claim.token, { status: "accepted", authorization: result.authorization });
    // A rejection may be a duplicate of an earlier request whose response was lost.
    const afterRejection = await gateway.consult(s, number, record.id);
    if (afterRejection) return await repository.finish(record.id, claim.token, { status: "accepted", authorization: afterRejection });
    if (await gateway.last(s) !== number - 1 || result.codes.some((code) => code <= 602 || code === 10016)) throw new Error("No se pudo descartar una autorizacion previa.");
    return await repository.finish(record.id, claim.token, { status: "rejected", codes: result.codes });
  } catch {
    // Once a number is durable, fail closed even if the failure was not transport-related.
    // No error body, token, key or SOAP payload is stored or returned.
    return await repository.finish(record.id, claim.token, { status: record.number === null ? "rejected" : "uncertain" });
  }
}
