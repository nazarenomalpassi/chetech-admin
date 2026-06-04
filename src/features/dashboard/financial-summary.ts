import { getTvBoardSaleStatus } from "@/features/tv-boards/sales";
import { formatCashMethod } from "@/lib/cash";

export function getDashboardAccountLabel(method: string) {
  return formatCashMethod(method);
}

export function getPendingTvBoardsReleaseAmount(
  boards: Array<{
    soldAt: string | null;
    releaseDate: string | null;
    netAmount: number | null;
  }>,
  today: string
) {
  return boards.reduce((acc, board) => {
    const saleStatus = getTvBoardSaleStatus(
      {
        soldAt: board.soldAt,
        releaseDate: board.releaseDate
      },
      today
    );

    if (saleStatus !== "pending_release") {
      return acc;
    }

    return acc + Number(board.netAmount ?? 0);
  }, 0);
}
