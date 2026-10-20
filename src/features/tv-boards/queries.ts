import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readRecordPages } from "@/lib/read-record-pages";
import { getTvBoardFinancialSummary, getTvBoardSaleStatus, getTvBoardReleaseEvidence } from "./sales";
import { tvBoardFiltersSchema } from "./schemas";
import type { TvBoardRow } from "./model";
import { matchesSearchText } from "@/lib/search";
import { getLocalDateInputValue } from "@/lib/utils";
import type { z } from "zod";

type Filters = Partial<z.infer<typeof tvBoardFiltersSchema>>;

function filterBoards(boards: TvBoardRow[], filters: Filters = {}) {
  return boards.filter(board => {
    if (!matchesSearchText(`${board.brand} ${board.model}`, filters.search)) return false;
    if (filters.boardType && filters.boardType !== "all" && board.boardType !== filters.boardType) return false;
    switch (filters.status) {
      case "active": return !board.isSold && board.isActive;
      case "inactive": return !board.isSold && !board.isActive;
      case "sold": return board.isSold;
      case "pending_release": case "released": case "claim_open": case "cancelled": return board.saleStatus === filters.status;
      default: return true;
    }
  });
}

export async function getTvBoards(filters?: Filters): Promise<TvBoardRow[]> {
  const supabase = await createServerSupabaseClient();
  // Global totals and the claims queue must not depend on inventory filters or REST row caps.
  const [rows, events] = await Promise.all([
    readRecordPages<any>((from, to) => (supabase as any).from("tv_boards")
      .select("id,brand,model,board_type,listed_price,acquisition_cost,is_active,sold_at,mercado_libre_net_amount,release_date,released_at,sale_notes,claim_status,claim_opened_at,claim_notes,claim_resolved_at,claim_resolution_notes,financial_version,created_at,updated_at", { count: "exact" })
      .order("id").range(from, to), 500, row => row.id),
    readRecordPages<any>((from, to) => (supabase as any).from("tv_board_sale_events")
      .select("id,board_id,kind,notes,net_amount,created_at", { count: "exact" }).order("id").range(from, to), 500, row => row.id)
  ]);
  const today = getLocalDateInputValue();
  const byBoard = new Map<string, TvBoardRow["events"]>();
  for (const event of events) {
    const list = byBoard.get(event.board_id) ?? [];
    list.push({ id: event.id, kind: event.kind, notes: event.notes, netAmount: Number(event.net_amount), createdAt: event.created_at });
    byBoard.set(event.board_id, list);
  }
  const boards: TvBoardRow[] = rows.map(board => {
    const state = { soldAt: board.sold_at, releaseDate: board.release_date, releasedAt: board.released_at, claimStatus: board.claim_status };
    return {
      id: board.id, brand: board.brand, model: board.model, boardType: board.board_type,
      price: Number(board.listed_price ?? 0), acquisitionCost: board.acquisition_cost == null ? null : Number(board.acquisition_cost),
      isActive: board.is_active, isSold: Boolean(board.sold_at), ...state,
      netAmount: board.mercado_libre_net_amount == null ? null : Number(board.mercado_libre_net_amount),
      saleNotes: board.sale_notes, saleStatus: getTvBoardSaleStatus(state), releaseEvidence: getTvBoardReleaseEvidence(state, today),
      claimOpenedAt: board.claim_opened_at ?? null, claimNotes: board.claim_notes ?? null,
      claimResolvedAt: board.claim_resolved_at ?? null, claimResolutionNotes: board.claim_resolution_notes ?? null,
      version: board.financial_version, createdAt: board.created_at, updatedAt: board.updated_at,
      events: (byBoard.get(board.id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    };
  });
  boards.sort((a, b) => a.brand.localeCompare(b.brand, "es") || a.model.localeCompare(b.model, "es") || a.id.localeCompare(b.id));
  return filterBoards(boards, filters);
}

export async function getTvBoardsPageData(filters: Filters = {}) {
  const all = await getTvBoards();
  return {
    boards: filterBoards(all, filters),
    claims: all.filter(board => board.saleStatus === "claim_open").sort((a, b) => (b.claimOpenedAt ?? "").localeCompare(a.claimOpenedAt ?? "") || a.id.localeCompare(b.id)),
    summary: getTvBoardFinancialSummary(all)
  };
}
