import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTvBoardSaleStatus, getTvBoardReleaseEvidence, type TvBoardReleaseEvidence } from "@/features/tv-boards/sales";
import { matchesSearchText } from "@/lib/search";
import { getLocalDateInputValue } from "@/lib/utils";

type TvBoardRow = {
  id: string;
  brand: string;
  model: string;
  boardType: "fuente" | "main" | "tcom" | "placa_unica";
  price: number;
  acquisitionCost: number | null;
  releaseEvidence: TvBoardReleaseEvidence;
  isActive: boolean;
  isSold: boolean;
  soldAt: string | null;
  netAmount: number | null;
  releaseDate: string | null;
  releasedAt: string | null;
  saleNotes: string | null;
  saleStatus: "unsold" | "pending_release" | "released";
  createdAt: string;
  updatedAt: string;
};

export async function getTvBoards(filters?: {
  search?: string;
  boardType?: "all" | "fuente" | "main" | "tcom" | "placa_unica";
  status?: "all" | "active" | "inactive" | "sold" | "pending_release" | "released";
}) {
  const supabase = await createServerSupabaseClient();
  let query = (supabase as any)
    .from("tv_boards")
    .select(
      "id, brand, model, board_type, listed_price, acquisition_cost, is_active, sold_at, mercado_libre_net_amount, release_date, released_at, sale_notes, created_at, updated_at"
    )
    .order("brand")
    .order("model");

  if (filters?.boardType && filters.boardType !== "all") {
    query = query.eq("board_type", filters.boardType);
  }

  if (filters?.status === "active") {
    query = query.eq("is_active", true);
  }

  if (filters?.status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === "42P01") {
      return [];
    }

    throw new Error(error.message);
  }

  const today = getLocalDateInputValue();

  const boards: TvBoardRow[] = (data ?? []).map((board: any) => {
      const saleStatus = getTvBoardSaleStatus(
        {
          soldAt: board.sold_at,
          releaseDate: board.release_date,
          releasedAt: board.released_at
        },
        today
      );

      return {
        id: board.id,
        brand: board.brand,
        model: board.model,
        boardType: board.board_type,
        price: Number(board.listed_price ?? 0),
        acquisitionCost: board.acquisition_cost == null ? null : Number(board.acquisition_cost),
        releaseEvidence: getTvBoardReleaseEvidence({ soldAt: board.sold_at, releaseDate: board.release_date, releasedAt: board.released_at }, today),
        isActive: board.is_active,
        isSold: Boolean(board.sold_at),
        soldAt: board.sold_at,
        netAmount: board.mercado_libre_net_amount === null ? null : Number(board.mercado_libre_net_amount),
        releaseDate: board.release_date,
        releasedAt: board.released_at,
        saleNotes: board.sale_notes,
        saleStatus,
        createdAt: board.created_at,
        updatedAt: board.updated_at
      };
    });

  return boards.filter((board: TvBoardRow) => {
    if (!matchesSearchText(`${board.brand} ${board.model}`, filters?.search)) {
      return false;
    }

    switch (filters?.status) {
      case "active":
        return !board.isSold && board.isActive;
      case "inactive":
        return !board.isSold && !board.isActive;
      case "sold":
        return board.isSold;
      case "pending_release":
        return board.isSold && board.releaseEvidence !== "confirmed";
      case "released":
        return board.releaseEvidence === "confirmed";
      default:
        return true;
    }
  });
}
