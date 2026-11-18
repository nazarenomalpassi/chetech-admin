import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readRecordPages } from "@/lib/read-record-pages";
import {
  getTvBoardFinancialSummary,
  getTvBoardSaleStatus,
  getTvBoardReleaseEvidence
} from "./sales";
import { tvBoardFiltersSchema } from "./schemas";
import type { TvBoardBox, TvBoardRow } from "./model";
import { matchesSearchText } from "@/lib/search";
import { getLocalDateInputValue } from "@/lib/utils";
import type { z } from "zod";

type Filters = Partial<z.infer<typeof tvBoardFiltersSchema>>;

export function normalizeBrand(brand: string) {
  return brand.trim().toLocaleLowerCase("es");
}

function filterBoards(
  boards: TvBoardRow[],
  filters: Filters = {},
  boxNumbers: ReadonlyMap<string, number> = new Map()
) {
  // "caja 3" en el buscador abre esa caja exacta: no mezcla modelos que tengan un 3.
  const boxSearch = filters.search?.match(/^\s*caja\s*(\d+)\s*$/i)?.[1];
  return boards.filter((board) => {
    const boxNumber = board.boxId ? boxNumbers.get(board.boxId) : undefined;
    if (boxSearch) {
      if (String(boxNumber ?? "") !== String(Number(boxSearch))) return false;
    } else if (!matchesSearchText(`${board.brand} ${board.model}`, filters.search)) {
      return false;
    }
    if (filters.brand && normalizeBrand(board.brand) !== normalizeBrand(filters.brand))
      return false;
    if (filters.caja) {
      if (filters.caja === "sin" ? board.boxId !== null : String(boxNumber ?? "") !== filters.caja)
        return false;
    }
    if (filters.boardType && filters.boardType !== "all" && board.boardType !== filters.boardType)
      return false;
    switch (filters.status) {
      case "active":
        return !board.isSold && board.isActive;
      case "inactive":
        return !board.isSold && !board.isActive;
      case "sold":
        return board.isSold;
      case "pending_release":
      case "released":
      case "claim_open":
      case "cancelled":
        return board.saleStatus === filters.status;
      default:
        return true;
    }
  });
}

const BOARD_COLUMNS =
  "id,brand,model,board_type,listed_price,acquisition_cost,is_active,sold_at,mercado_libre_net_amount,release_date,released_at,sale_notes,claim_status,claim_opened_at,claim_notes,claim_resolved_at,claim_resolution_notes,financial_version,created_at,updated_at,sales(id,sale_number,sale_payments(method,amount))";

type BoxRecord = { id: string; number: number; label: string | null; created_at: string };

/**
 * Lee las cajas. Si la tabla todavía no existe (base sin la migración del organizador),
 * devuelve ready=false y el resto de la sección sigue funcionando sin cajas.
 */
async function readBoxes(supabase: any): Promise<{ ready: boolean; boxes: BoxRecord[] }> {
  const { data, error } = await supabase
    .from("tv_board_boxes")
    .select("id,number,label,created_at")
    .order("number", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { ready: false, boxes: [] };
    throw new Error(error.message);
  }
  return { ready: true, boxes: (data ?? []) as BoxRecord[] };
}

async function readBoards(supabase: any, boxesReady: boolean): Promise<TvBoardRow[]> {
  const columns = boxesReady ? `${BOARD_COLUMNS},box_id` : BOARD_COLUMNS;
  // Global totals and the claims queue must not depend on inventory filters or REST row caps.
  const [rows, events] = await Promise.all([
    readRecordPages<any>(
      (from, to) =>
        (supabase as any)
          .from("tv_boards")
          .select(columns, { count: "exact" })
          .order("id")
          .range(from, to),
      500,
      (row) => row.id
    ),
    readRecordPages<any>(
      (from, to) =>
        (supabase as any)
          .from("tv_board_sale_events")
          .select("id,board_id,kind,notes,net_amount,created_at", { count: "exact" })
          .order("id")
          .range(from, to),
      500,
      (row) => row.id
    )
  ]);
  const today = getLocalDateInputValue();
  const byBoard = new Map<string, TvBoardRow["events"]>();
  for (const event of events) {
    const list = byBoard.get(event.board_id) ?? [];
    list.push({
      id: event.id,
      kind: event.kind,
      notes: event.notes,
      netAmount: Number(event.net_amount),
      createdAt: event.created_at
    });
    byBoard.set(event.board_id, list);
  }
  const boards: TvBoardRow[] = rows.map((board) => {
    const state = {
      soldAt: board.sold_at,
      releaseDate: board.release_date,
      releasedAt: board.released_at,
      claimStatus: board.claim_status
    };
    const sale = Array.isArray(board.sales) ? board.sales[0] : board.sales;
    const payments = sale?.sale_payments;
    const method = (Array.isArray(payments) ? payments[0] : payments)?.method;
    return {
      id: board.id,
      brand: board.brand,
      model: board.model,
      boardType: board.board_type,
      boxId: board.box_id ?? null,
      price: Number(board.listed_price ?? 0),
      acquisitionCost: board.acquisition_cost == null ? null : Number(board.acquisition_cost),
      isActive: board.is_active,
      isSold: Boolean(board.sold_at),
      ...state,
      netAmount:
        board.mercado_libre_net_amount == null ? null : Number(board.mercado_libre_net_amount),
      saleNotes: board.sale_notes,
      saleStatus: getTvBoardSaleStatus(state),
      releaseEvidence: getTvBoardReleaseEvidence(state, today),
      claimOpenedAt: board.claim_opened_at ?? null,
      claimNotes: board.claim_notes ?? null,
      claimResolvedAt: board.claim_resolved_at ?? null,
      claimResolutionNotes: board.claim_resolution_notes ?? null,
      version: board.financial_version,
      createdAt: board.created_at,
      updatedAt: board.updated_at,
      linkedSale: sale
        ? {
            id: sale.id,
            number: sale.sale_number,
            method: method === "nx" || method === "mp" ? method : null
          }
        : null,
      events: (byBoard.get(board.id) ?? []).sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
      )
    };
  });
  boards.sort(
    (a, b) =>
      a.brand.localeCompare(b.brand, "es") ||
      a.model.localeCompare(b.model, "es") ||
      a.id.localeCompare(b.id)
  );
  return boards;
}

export async function getTvBoards(filters?: Filters): Promise<TvBoardRow[]> {
  const supabase = await createServerSupabaseClient();
  const { ready, boxes } = await readBoxes(supabase);
  const boards = await readBoards(supabase, ready);
  return filterBoards(boards, filters, new Map(boxes.map((box) => [box.id, box.number])));
}

/** Las placas que siguen físicamente en una caja: las que no se vendieron. */
function isStored(board: TvBoardRow) {
  return !board.isSold;
}

function summarizeBoxes(boxes: BoxRecord[], boards: TvBoardRow[]): TvBoardBox[] {
  return boxes.map((box) => {
    const stored = boards.filter((board) => board.boxId === box.id && isStored(board));
    const byType: TvBoardBox["byType"] = { fuente: 0, main: 0, tcom: 0, placa_unica: 0 };
    for (const board of stored) byType[board.boardType] += 1;
    return {
      id: box.id,
      number: box.number,
      label: box.label,
      createdAt: box.created_at,
      inStock: stored.length,
      available: stored.filter((board) => board.isActive).length,
      byType,
      preview: stored.slice(0, 4).map((board) => `${board.brand} ${board.model}`)
    };
  });
}

function listBrands(boards: TvBoardRow[]) {
  const brands = new Map<string, string>();
  for (const board of boards) {
    const key = normalizeBrand(board.brand);
    if (key && !brands.has(key)) brands.set(key, board.brand.trim());
  }
  return [...brands.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export async function getTvBoardsPageData(filters: Filters = {}) {
  const supabase = await createServerSupabaseClient();
  const { ready, boxes: boxRecords } = await readBoxes(supabase);
  const all = await readBoards(supabase, ready);
  const boxNumbers = new Map(boxRecords.map((box) => [box.id, box.number]));
  const boxes = summarizeBoxes(boxRecords, all);
  const unboxed = all.filter((board) => board.boxId === null && isStored(board));
  const selectedBox =
    filters.caja && filters.caja !== "sin"
      ? (boxes.find((box) => String(box.number) === filters.caja) ?? null)
      : null;
  // Dentro de una caja se ven las placas guardadas; las vendidas solo con un estado de venta.
  const salesStatus = ["sold", "pending_release", "released", "claim_open", "cancelled"];
  const filtered = filterBoards(all, filters, boxNumbers).filter(
    (board) => !filters.caja || salesStatus.includes(filters.status ?? "") || isStored(board)
  );
  return {
    boards: filtered,
    boxes,
    boxesReady: ready,
    selectedBox,
    unboxedCount: unboxed.length,
    brands: listBrands(all),
    claims: all
      .filter((board) => board.saleStatus === "claim_open")
      .sort(
        (a, b) =>
          (b.claimOpenedAt ?? "").localeCompare(a.claimOpenedAt ?? "") || a.id.localeCompare(b.id)
      ),
    summary: getTvBoardFinancialSummary(all)
  };
}
