import type { TvBoardClaimStatus, TvBoardFinancialSummary } from "./model";

export type TvBoardSaleStatus = "unsold" | "pending_release" | "released" | "claim_open" | "cancelled";
export type TvBoardReleaseEvidence = "unsold" | "pending" | "estimated_due" | "unconfirmed" | "confirmed" | "held" | "cancelled";

type BoardFinancialState = {
  soldAt: string | null;
  releaseDate?: string | null;
  releasedAt?: string | null;
  claimStatus?: TvBoardClaimStatus;
};

export function getTvBoardReleaseEvidence(board: BoardFinancialState, today: string): TvBoardReleaseEvidence {
  if (!board.soldAt) return "unsold";
  if (board.claimStatus === "open") return "held";
  if (board.claimStatus === "cancelled") return "cancelled";
  if (board.releasedAt) return "confirmed";
  if (!board.releaseDate) return "unconfirmed";
  return board.releaseDate <= today ? "estimated_due" : "pending";
}

export function getTvBoardMargin(netAmount: number | null, cost: number | null) {
  if (netAmount == null || cost == null) return null;
  return (Math.round(netAmount * 100) - Math.round(cost * 100)) / 100;
}

export function getTvBoardSaleStatus(board: BoardFinancialState, today?: string): TvBoardSaleStatus {
  const evidence = getTvBoardReleaseEvidence(board, today ?? "");
  if (evidence === "unsold") return "unsold";
  if (evidence === "held") return "claim_open";
  if (evidence === "cancelled") return "cancelled";
  return evidence === "confirmed" ? "released" : "pending_release";
}

export function getTvBoardFinancialSummary(boards: Array<BoardFinancialState & {
  netAmount: number | null;
  acquisitionCost?: number | null;
  isActive?: boolean;
  price?: number;
}>): TvBoardFinancialSummary {
  const result: TvBoardFinancialSummary = {
    activeCount: 0, inactiveCount: 0, activeValue: 0, salesNetAmount: 0,
    pendingAmount: 0, heldAmount: 0, releasedAmount: 0, cancelledAmount: 0,
    knownMargin: 0, incompleteCosts: 0
  };
  // Sum money in cents once, then convert each aggregate for display.
  for (const board of boards) {
    const status = getTvBoardSaleStatus(board);
    if (status === "unsold") {
      if (board.isActive) { result.activeCount++; result.activeValue += Math.round((board.price ?? 0) * 100); }
      else result.inactiveCount++;
      continue;
    }
    const cents = Math.round((board.netAmount ?? 0) * 100);
    if (status === "cancelled") { result.cancelledAmount += cents; continue; }
    result.salesNetAmount += cents;
    if (status === "claim_open") result.heldAmount += cents;
    else if (status === "released") result.releasedAmount += cents;
    else result.pendingAmount += cents;
    // Disputed sales have no reliable realized margin yet.
    if (status === "claim_open") continue;
    const margin = getTvBoardMargin(board.netAmount, board.acquisitionCost ?? null);
    if (margin == null) result.incompleteCosts++;
    else result.knownMargin += Math.round(margin * 100);
  }
  for (const key of ["activeValue", "salesNetAmount", "pendingAmount", "heldAmount", "releasedAmount", "cancelledAmount", "knownMargin"] as const) result[key] /= 100;
  return result;
}
