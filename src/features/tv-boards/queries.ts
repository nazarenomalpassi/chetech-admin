import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTvBoardSaleStatus } from "@/features/tv-boards/sales";
import { getLocalDateInputValue } from "@/lib/utils";

type TvBoardRow = {
  id: string;
  brand: string;
  model: string;
  boardType: "fuente" | "main" | "tcom" | "placa_unica";
  price: number;
  isActive: boolean;
  isSold: boolean;
  soldAt: string | null;
  netAmount: number | null;
  releaseDate: string | null;
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
      "id, brand, model, board_type, listed_price, is_active, sold_at, mercado_libre_net_amount, release_date, sale_notes, created_at, updated_at"
    )
    .order("brand")
    .order("model");

  if (filters?.search) {
    query = query.or(`brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%`);
  }

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
          releaseDate: board.release_date
        },
        today
      );

      return {
        id: board.id,
        brand: board.brand,
        model: board.model,
        boardType: board.board_type,
        price: Number(board.listed_price ?? 0),
        isActive: board.is_active,
        isSold: Boolean(board.sold_at),
        soldAt: board.sold_at,
        netAmount: board.mercado_libre_net_amount === null ? null : Number(board.mercado_libre_net_amount),
        releaseDate: board.release_date,
        saleNotes: board.sale_notes,
        saleStatus,
        createdAt: board.created_at,
        updatedAt: board.updated_at
      };
    });

  return boards.filter((board: TvBoardRow) => {
    switch (filters?.status) {
      case "active":
        return !board.isSold && board.isActive;
      case "inactive":
        return !board.isSold && !board.isActive;
      case "sold":
        return board.isSold;
      case "pending_release":
        return board.saleStatus === "pending_release";
      case "released":
        return board.saleStatus === "released";
      default:
        return true;
    }
  });
}
