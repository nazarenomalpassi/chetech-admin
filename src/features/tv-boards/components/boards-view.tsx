"use client";

import { useMemo, useState } from "react";
import { CircuitBoard, HandCoins, Landmark, PackagePlus, ShieldAlert, WalletCards } from "lucide-react";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

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

  const selectedBoard = useMemo<TvBoardFormValues | null>(() => {
    if (!selectedId) return null;
    const board = boards.find((item) => item.id === selectedId);
    if (!board) return null;

    return {
      id: board.id,
      brand: board.brand,
      model: board.model,
      boardType: board.boardType,
      price: board.price,
      acquisitionCost: board.acquisitionCost,
      isActive: board.isActive
    };
  }, [boards, selectedId]);

  const selectedSaleBoard = useMemo(() => {
    if (!selectedSaleId) return null;
    return boards.find((item) => item.id === selectedSaleId) ?? null;
  }, [boards, selectedSaleId]);

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="panel-kicker">Inventario tecnico</p>
            <h1 className="panel-heading mt-3">Placas de Televisores</h1>
            <p className="panel-subheading mt-3">
              Lleva control fino de placas fuente, main, tcom y placa unica, con seguimiento financiero real de ventas
              por Mercado Libre y liberacion del dinero.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[42rem] xl:grid-cols-3">
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <CircuitBoard className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Activas
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{activeBoards}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <PackagePlus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Valor publicado
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{formatCurrency(activeValue)}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-finance-cautionSoft text-finance-caution">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Dadas de baja
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{inactiveBoards}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-emerald-200 bg-finance-profitSoft text-finance-profit">
                  <WalletCards className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Ingreso neto de ventas
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(realRevenue)}
                  </p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-amber-200 bg-finance-cautionSoft text-finance-caution">
                  <Landmark className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Neto sin confirmacion de liberacion
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(pendingRelease)}
                  </p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-emerald-200 bg-finance-profitSoft text-finance-profit">
                  <HandCoins className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Liberacion confirmada
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(releasedMoney)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">Margen directo con costos conocidos: {formatCurrency(knownMargin)}</p>
          <p>{incompleteCosts ? `${incompleteCosts} venta(s) con costo o neto incompleto, excluidas del margen.` : "Costos completos para las ventas de esta vista."} No es utilidad neta del local.</p>
          <p className="mt-2">La fecha prevista no acredita un deposito. La confirmacion manual registra evidencia; no crea movimientos ni recalcula saldos de caja.</p>
        </div>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex-1">
            <BoardFilters />
          </div>
          {canManage ? (
            <Button
              onClick={() => {
                setSelectedId(null);
                setOpen(true);
              }}
            >
              <PackagePlus className="mr-2 h-4 w-4" />
              Nueva placa
            </Button>
          ) : (
            <div className="status-banner">Modo empleado: podes consultar placas, pero no alterar el inventario.</div>
          )}
        </div>
      </Card>

      <BoardTable
        boards={boards}
        canManage={canManage}
        onEdit={(id) => {
          setSelectedId(id);
          setOpen(true);
        }}
        onSell={(id) => {
          setSelectedSaleId(id);
          setSaleOpen(true);
        }}
      />

      {canManage ? (
        <BoardFormDialog
          board={selectedBoard}
          onClose={() => {
            setOpen(false);
            setSelectedId(null);
          }}
          open={open}
        />
      ) : null}
      {canManage ? (
        <BoardSaleDialog
          board={selectedSaleBoard}
          onClose={() => {
            setSaleOpen(false);
            setSelectedSaleId(null);
          }}
          open={saleOpen}
        />
      ) : null}
    </div>
  );
}
