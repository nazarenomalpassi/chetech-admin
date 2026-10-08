"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BoardFilters } from "@/features/tv-boards/components/board-filters";
import { BoardFormDialog } from "@/features/tv-boards/components/board-form-dialog";
import { BoardSaleDialog } from "@/features/tv-boards/components/board-sale-dialog";
import { BoardTable } from "@/features/tv-boards/components/board-table";
import type { TvBoardFormValues } from "@/features/tv-boards/schemas";
import { formatCurrency } from "@/lib/utils";
import { getTvBoardMargin, type TvBoardSaleStatus, type TvBoardReleaseEvidence } from "@/features/tv-boards/sales";

export function BoardsView({
  boards,
  canManage
}: {
  boards: Array<{
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
    saleStatus: TvBoardSaleStatus;
    createdAt: string;
  }>;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<TvBoardFormValues | null>(null);
  const [selectedSaleBoard, setSelectedSaleBoard] = useState<{ id: string; brand: string; model: string; price: number } | null>(null);

  const activeInventory = boards.filter((board) => !board.isSold && board.isActive);
  const inactiveInventory = boards.filter((board) => !board.isSold && !board.isActive);
  const soldBoards = boards.filter((board) => board.isSold);

  const activeBoards = activeInventory.length;
  const activeValue = activeInventory.reduce((acc, board) => acc + board.price, 0);
  const inactiveBoards = inactiveInventory.length;
  const realRevenue = soldBoards.reduce((acc, board) => acc + (board.netAmount ?? 0), 0);
  const pendingRelease = boards
    .filter((board) => board.isSold && board.releaseEvidence !== "confirmed")
    .reduce((acc, board) => acc + (board.netAmount ?? 0), 0);
  const releasedMoney = boards
    .filter((board) => board.releaseEvidence === "confirmed")
    .reduce((acc, board) => acc + (board.netAmount ?? 0), 0);
  const knownMargin = soldBoards.reduce((acc, board) => acc + (getTvBoardMargin(board.netAmount, board.acquisitionCost) ?? 0), 0);
  const incompleteCosts = soldBoards.filter((board) => board.acquisitionCost == null || board.netAmount == null).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="panel-heading">Placas de televisores</h1>
            <p className="mt-1 text-sm text-slate-600">{activeBoards} disponibles, {inactiveBoards} dadas de baja. Valor publicado: {formatCurrency(activeValue)}.</p>
          </div>
          {canManage ? (
            <Button onClick={() => { setSelectedBoard(null); setOpen(true); }}>
              <PackagePlus className="h-4 w-4" />
              Nueva placa
            </Button>
          ) : <p className="text-sm text-slate-600">Inventario de consulta</p>}
        </div>

        <dl className="mt-4 grid gap-4 border-y border-slate-200 py-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-sm text-slate-600">Neto de ventas</dt>
            <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-slate-950">{formatCurrency(realRevenue)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-slate-600">Pendiente de confirmar</dt>
            <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-slate-950">{formatCurrency(pendingRelease)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-slate-600">Liberacion confirmada</dt>
            <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-slate-950">{formatCurrency(releasedMoney)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-slate-600">Importes de los resultados actuales. Una fecha prevista no confirma un deposito ni mueve caja.</p>
        <details className="mt-1">
          <summary className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg px-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Ver margen directo</summary>
          <div className="space-y-1 pb-3 text-sm text-slate-600">
            <p>Margen con costos conocidos: {formatCurrency(knownMargin)}. No es utilidad neta del local.</p>
            <p>{incompleteCosts ? `${incompleteCosts} venta(s) con costo o neto incompleto, excluidas del margen.` : "Costos completos para las ventas de esta vista."}</p>
          </div>
        </details>
        <div className="mt-3"><BoardFilters /></div>
      </Card>

      <BoardTable
        boards={boards}
        canManage={canManage}
        onEdit={(id) => {
          const board = boards.find((item) => item.id === id);
          if (!board) return;
          setSelectedBoard({ id: board.id, brand: board.brand, model: board.model, boardType: board.boardType, price: board.price, acquisitionCost: board.acquisitionCost, isActive: board.isActive });
          setOpen(true);
        }}
        onSell={(id) => {
          const board = boards.find((item) => item.id === id);
          if (!board) return;
          setSelectedSaleBoard({ id: board.id, brand: board.brand, model: board.model, price: board.price });
          setSaleOpen(true);
        }}
      />

      {canManage ? (
        <BoardFormDialog
          board={selectedBoard}
          onClose={() => {
            setOpen(false);
            setSelectedBoard(null);
          }}
          open={open}
        />
      ) : null}
      {canManage ? (
        <BoardSaleDialog
          board={selectedSaleBoard}
          onClose={() => {
            setSaleOpen(false);
            setSelectedSaleBoard(null);
          }}
          open={saleOpen}
        />
      ) : null}
    </div>
  );
}
