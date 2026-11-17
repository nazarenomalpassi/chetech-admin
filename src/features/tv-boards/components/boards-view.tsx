"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BoardFilters } from "@/features/tv-boards/components/board-filters";
import { BoardClaimsSection } from "@/features/tv-boards/components/board-claims-section";
import { BoardClaimDialog } from "@/features/tv-boards/components/board-claim-dialog";
import { BoardFormDialog } from "@/features/tv-boards/components/board-form-dialog";
import { BoardSaleDialog } from "@/features/tv-boards/components/board-sale-dialog";
import { BoardTable } from "@/features/tv-boards/components/board-table";
import type { TvBoardFormValues } from "@/features/tv-boards/schemas";
import { formatCurrency } from "@/lib/utils";
import type { TvBoardFinancialSummary, TvBoardRow } from "@/features/tv-boards/model";

export function BoardsView({
  boards,
  claims,
  summary,
  canManage
}: {
  boards: TvBoardRow[];
  claims: TvBoardRow[];
  summary: TvBoardFinancialSummary;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<TvBoardFormValues | null>(null);
  const [selectedSaleBoard, setSelectedSaleBoard] = useState<{
    id: string;
    brand: string;
    model: string;
    price: number;
  } | null>(null);
  const [claimDialog, setClaimDialog] = useState<{
    board: TvBoardRow;
    mode: "start" | "resolve";
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [updatedVersions, setUpdatedVersions] = useState<Record<string, number>>({});

  function recordSaleChange(id: string, recordVersion: number | undefined, message: string) {
    if (recordVersion !== undefined) {
      setUpdatedVersions((previous) => ({
        ...previous,
        [id]: Math.max(previous[id] ?? 0, recordVersion)
      }));
    }
    setNotice(message);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="panel-heading">Placas de televisores</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.activeCount} disponibles, {summary.inactiveCount} dadas de baja. Valor
              publicado: {formatCurrency(summary.activeValue)}.
            </p>
          </div>
          {canManage ? (
            <Button
              onClick={() => {
                setSelectedBoard(null);
                setOpen(true);
              }}
            >
              <PackagePlus className="h-4 w-4" />
              Nueva placa
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Inventario de consulta</p>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-3 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Neto de ventas</dt>
            <dd className="mt-1 wrap-break-word">
              <span className="text-xl font-semibold text-foreground tabular-nums">
                {formatCurrency(summary.salesNetAmount)}
              </span>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Incluye dinero retenido; excluye ventas anuladas.
              </p>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Pendiente de confirmar</dt>
            <dd className="mt-1 wrap-break-word">
              <span className="text-xl font-semibold text-foreground tabular-nums">
                {formatCurrency(summary.pendingAmount)}
              </span>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Ventas sin reclamos abiertos.
              </p>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-warning">Dinero retenido</dt>
            <dd className="mt-1 wrap-break-word">
              <span className="text-xl font-semibold text-warning tabular-nums">
                {formatCurrency(summary.heldAmount)}
              </span>
              <p className="mt-1 text-xs leading-5 text-warning">
                Reclamos abiertos; no disponible.
              </p>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-success">Liberacion confirmada</dt>
            <dd className="mt-1 wrap-break-word">
              <span className="text-xl font-semibold text-success tabular-nums">
                {formatCurrency(summary.releasedAmount)}
              </span>
              <p className="mt-1 text-xs leading-5 text-success">Confirmada manualmente.</p>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          Totales globales, independientes de los filtros. Una fecha prevista no confirma un
          deposito ni mueve caja.
        </p>
        <details className="mt-1">
          <summary className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg px-2 text-sm font-medium text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
            Ver margen directo
          </summary>
          <div className="space-y-1 pb-3 text-sm text-muted-foreground">
            <p>
              Margen con costos conocidos: {formatCurrency(summary.knownMargin)}. No es utilidad
              neta del local.
            </p>
            <p>El margen excluye reclamos abiertos y ventas anuladas.</p>
            <p>
              {summary.incompleteCosts
                ? `${summary.incompleteCosts} venta(s) con costo o neto incompleto, excluidas del margen.`
                : "Costos completos para las ventas incluidas en el margen."}
            </p>
          </div>
        </details>
        <div className="mt-3">
          <BoardFilters />
        </div>
      </Card>

      {notice ? (
        <p className="status-banner" role="status">
          {notice}
        </p>
      ) : null}

      <BoardClaimsSection
        claims={claims}
        canManage={canManage}
        updatedVersions={updatedVersions}
        onResolve={(board) => {
          setNotice("");
          setClaimDialog({ board, mode: "resolve" });
        }}
      />

      <BoardTable
        boards={boards}
        canManage={canManage}
        onSaleChanged={recordSaleChange}
        updatedVersions={updatedVersions}
        onStartClaim={(id) => {
          const board = boards.find((item) => item.id === id);
          if (
            !canManage ||
            !board ||
            !board.isSold ||
            board.claimStatus !== "none" ||
            board.releasedAt ||
            board.releaseEvidence === "confirmed"
          )
            return;
          setNotice("");
          setClaimDialog({ board, mode: "start" });
        }}
        onEdit={(id) => {
          const board = boards.find((item) => item.id === id);
          if (!board) return;
          setSelectedBoard({
            id: board.id,
            brand: board.brand,
            model: board.model,
            boardType: board.boardType,
            price: board.price,
            acquisitionCost: board.acquisitionCost,
            isActive: board.isActive
          });
          setOpen(true);
        }}
        onSell={(id) => {
          const board = boards.find((item) => item.id === id);
          if (!board) return;
          setSelectedSaleBoard({
            id: board.id,
            brand: board.brand,
            model: board.model,
            price: board.price
          });
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
      {canManage && claimDialog ? (
        <BoardClaimDialog
          board={claimDialog.board}
          key={`${claimDialog.mode}-${claimDialog.board.id}`}
          mode={claimDialog.mode}
          onClose={() => setClaimDialog(null)}
          onSaved={(message, recordVersion) => {
            recordSaleChange(claimDialog.board.id, recordVersion, message);
            setClaimDialog(null);
          }}
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
