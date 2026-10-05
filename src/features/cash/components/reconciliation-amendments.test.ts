import { describe, expect, it } from "vitest";
import { getReconciliationChain, cashReconciliationAmendmentSchema } from "./reconciliation-model";
const rootId = "11111111-1111-4111-8111-111111111111";
const reopenId = "22222222-2222-4222-8222-222222222222";
const closeId = "33333333-3333-4333-8333-333333333333";
describe("immutable cash correction chain", () => {
  it("orders superseding entries by linkage, not transaction timestamps", () => {
    const chain = getReconciliationChain(rootId, [
      { id: closeId, root_id: rootId, supersedes_id: reopenId, kind: "closed", created_at: "2026-10-04" },
      { id: reopenId, root_id: rootId, supersedes_id: null, kind: "reopened", created_at: "2026-10-05" }
    ]);
    expect(chain.map((row) => row.id)).toEqual([reopenId, closeId]);
  });
  it("requires a meaningful amendment reason and explicit expected head", () => {
    expect(cashReconciliationAmendmentSchema.safeParse({ id: closeId, rootId, expectedHeadId: rootId, reason: "" }).success).toBe(false);
    expect(cashReconciliationAmendmentSchema.safeParse({ id: closeId, rootId, expectedHeadId: rootId, reason: "Conteo cargado por error" }).success).toBe(true);
  });
});
