export type TvBoardSaleStatus = "unsold" | "pending_release" | "released";

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
