export type PurchaseCommitments = {
  ready: boolean;
  knownOutstanding: number | null;
  unknownCostCount: number | null;
  purchaseCount: number | null;
};

export function suggestAfterCommitments(available: number, reserves: number, replacement: number, commitments: PurchaseCommitments) {
  const deduction = commitments.ready ? commitments.knownOutstanding ?? 0 : 0;
  return Math.max(Math.round((available - reserves - replacement - deduction) * 100) / 100, 0);
}
