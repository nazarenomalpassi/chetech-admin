export type TvBoardSaleStatus = "unsold" | "pending_release" | "released";

export function getTvBoardSaleStatus(
  {
    soldAt,
    releaseDate
  }: {
    soldAt: string | null;
    releaseDate: string | null;
  },
  today: string
): TvBoardSaleStatus {
  if (!soldAt) {
    return "unsold";
  }

  if (!releaseDate || releaseDate <= today) {
    return "released";
  }

  return "pending_release";
}
