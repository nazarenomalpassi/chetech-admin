export type TvBoardSaleStatus = "unsold" | "pending_release" | "released";
export type TvBoardReleaseEvidence = "unsold" | "pending" | "estimated_due" | "unconfirmed" | "confirmed";

export function getTvBoardReleaseEvidence(board: { soldAt: string | null; releaseDate: string | null; releasedAt?: string | null }, today: string): TvBoardReleaseEvidence {
  if (!board.soldAt) return "unsold";
  if (board.releasedAt) return "confirmed";
  if (!board.releaseDate) return "unconfirmed";
  return board.releaseDate <= today ? "estimated_due" : "pending";
}

export function getTvBoardMargin(netAmount: number | null, cost: number | null) {
  if (netAmount == null || cost == null) return null;
  return (Math.round(netAmount * 100) - Math.round(cost * 100)) / 100;
}

export function getTvBoardSaleStatus(
  {
    soldAt,
    releaseDate,
    releasedAt
  }: {
    soldAt: string | null;
    releaseDate: string | null;
    releasedAt?: string | null;
  },
  today: string
): TvBoardSaleStatus {
  if (!soldAt) {
    return "unsold";
  }

  if (releasedAt || !releaseDate || releaseDate <= today) {
    return "released";
  }

  return "pending_release";
}
