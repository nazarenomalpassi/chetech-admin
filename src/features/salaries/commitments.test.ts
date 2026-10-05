import { describe, expect, it } from "vitest";
import * as commitments from "./commitments";

describe("purchase deduction before the unchanged salary allocation", () => {
  it("deducts the unpaid known amount, not expected gross cost or unknown costs", () => {
    expect(commitments.suggestAfterCommitments(1000, 200, 100, { ready: true, knownOutstanding: 140, unknownCostCount: 2, purchaseCount: 3 })).toBe(560);
  });
  it("does not invent a reserve when linkage migration is absent", () => {
    expect(commitments.suggestAfterCommitments(1000, 200, 100, { ready: false, knownOutstanding: null, unknownCostCount: null, purchaseCount: null })).toBe(700);
  });
  it("never suggests a negative amount", () => {
    expect(commitments.suggestAfterCommitments(100, 50, 50, { ready: true, knownOutstanding: 10, unknownCostCount: 0, purchaseCount: 1 })).toBe(0);
  });
});
