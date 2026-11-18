"use client";

import { useRef, useState, useTransition } from "react";
import {
  CircleCheck,
  MessageSquareWarning,
  Package,
  Pencil,
  Power,
  Trash2,
  WalletCards
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { deleteTvBoardAction, toggleTvBoardStatusAction } from "@/features/tv-boards/actions";
import { BoardReleaseDialog } from "@/features/tv-boards/components/board-release-dialog";
import { BoardSaleHistory } from "@/features/tv-boards/components/board-sale-history";
import { TV_BOARD_TYPE_LABELS, type TvBoardRow } from "@/features/tv-boards/model";
import { getTvBoardMargin } from "@/features/tv-boards/sales";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod } from "@/lib/cash";
import { formatCurrency, formatDate } from "@/lib/utils";
import { confirmThen } from "@/components/ui/confirm-dialog";

type TvBoard = TvBoardRow;

const TYPE_LABELS = TV_BOARD_TYPE_LABELS;

/** Dónde está la placa: la respuesta que busca el buscador, siempre a la vista. */
function BoxLocation({ number, sold }: { number: number | null | undefined; sold: boolean }) {
  if (number == null) {
    // Una placa vendida ya no ocupa lugar: no hace falta decir que no tiene caja.
    if (sold) return <span className="text-sm text-muted-foreground">Vendida</span>;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Package aria-hidden="true" className="h-3.5 w-3.5" />
        Sin caja
      </span>
    );
  }
  return (
    <span
      className={
        sold
          ? "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
          : "inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-0.5 text-sm font-semibold text-primary-foreground"
      }
      title={sold ? `Estaba en la caja ${number}` : `Guardada en la caja ${number}`}
    >
      <Package aria-hidden="true" className="h-3.5 w-3.5" />
      {sold ? `Estaba en caja ${number}` : `Caja ${number}`}
    </span>
  );
}

export function BoardTable({
  boards,
  canManage,
  onEdit,
  onSell,
  onStartClaim,
  onSaleChanged,
  updatedVersions,
  boxNumbers,
  emptyMessage = "No hay placas con estos filtros. Probá otra búsqueda o cambiá el estado."
}: {
  boards: TvBoard[];
  emptyMessage?: string;
  /** Número de caja por id de caja. Si no viene, la columna de ubicación no se muestra. */
  boxNumbers?: ReadonlyMap<string, number>;
  canManage: boolean;
  onEdit: (id: string) => void;
  onSell: (id: string) => void;
  onStartClaim: (id: string) => void;
  onSaleChanged?: (id: string, recordVersion: number | undefined, message: string) => void;
  updatedVersions?: Readonly<Record<string, number>>;
}) {
  const [isPending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const operationIds = useRef(new Map<string, string>());
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [releaseBoard, setReleaseBoard] = useState<TvBoard | null>(null);
  const [releasedIds, setReleasedIds] = useState<ReadonlySet<string>>(new Set());

  function runMutation(
    operation: () => Promise<ActionResult & { recordVersion?: number }>,
    onSuccess?: (result: ActionResult & { recordVersion?: number }) => void
  ) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await operation();
        setFeedback(result);
        if (result.success) onSuccess?.(result);
      } catch {
        setFeedback({
          success: false,
          message:
            "No se pudo confirmar el cambio. Reintenta sin cambiar los datos para recuperar el resultado sin duplicarlo."
        });
      } finally {
        pendingRef.current = false;
      }
    });
  }

  function handleDelete(board: TvBoard) {
    confirmThen(
      {
        title: `¿Eliminar la placa ${board.brand} ${board.model}?`,
        description: "Se borra definitivamente.",
        confirmLabel: "Eliminar placa",
        tone: "danger"
      },
      () => runMutation(() => deleteTvBoardAction(board.id))
    );
  }

  function renderSaleBadge(board: TvBoard) {
    if (board.claimStatus === "open") return <Badge variant="warning">Dinero retenido</Badge>;
    if (board.claimStatus === "cancelled") return <Badge variant="default">Venta anulada</Badge>;
    if (!board.isSold) {
      return (
        <Badge variant={board.isActive ? "success" : "default"}>
          {board.isActive ? "Disponible" : "Baja"}
        </Badge>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Badge className="border-border bg-accent text-body" variant="default">
          Vendida
        </Badge>
        <Badge
          variant={
            board.releaseEvidence === "confirmed" || releasedIds.has(board.id)
              ? "success"
              : "warning"
          }
        >
          {board.releaseEvidence === "confirmed" || releasedIds.has(board.id)
            ? "Liberación confirmada"
            : board.releaseEvidence === "estimated_due"
              ? "Fecha prevista cumplida; sin confirmar"
              : "Liberación sin confirmar"}
        </Badge>
      </div>
    );
  }

  function renderActions(board: TvBoard) {
    if (!canManage) return <p className="text-sm text-muted-foreground">Solo administración</p>;
    const disabled =
      isPending || Boolean(releaseBoard) || (updatedVersions?.[board.id] ?? 0) > board.version;
    const canRelease =
      board.isSold &&
      board.claimStatus === "none" &&
      !board.releasedAt &&
      board.releaseEvidence !== "confirmed" &&
      !board.linkedSale &&
      !releasedIds.has(board.id);
    return (
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <Button
          disabled={disabled || Boolean(board.linkedSale)}
          onClick={() => onEdit(board.id)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {!board.isSold ? (
          <Button disabled={disabled} onClick={() => onSell(board.id)} size="sm" type="button">
            <WalletCards className="h-4 w-4" />
            Registrar venta
          </Button>
        ) : null}
        {canRelease ? (
          <Button
            disabled={disabled}
            onClick={() => onStartClaim(board.id)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />
            Iniciar reclamo
          </Button>
        ) : null}
        {canRelease ? (
          <Button
            disabled={disabled}
            onClick={() => {
              if (!pendingRef.current) {
                setFeedback(null);
                setReleaseBoard(board);
              }
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <CircleCheck className="h-4 w-4" />
            Confirmar liberación
          </Button>
        ) : null}
        <ActionMenu label="Más acciones">
          {!board.isSold ? (
            <Button
              disabled={disabled}
              onClick={() =>
                runMutation(() => toggleTvBoardStatusAction(board.id, !board.isActive))
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <Power className="h-4 w-4" />
              {board.isActive ? "Dar de baja" : "Reactivar"}
            </Button>
          ) : null}
          <Button
            disabled={disabled || board.isSold}
            onClick={() => handleDelete(board)}
            size="sm"
            type="button"
            variant="danger"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        </ActionMenu>
      </div>
    );
  }

  function renderDates(board: TvBoard) {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Alta: {formatDate(board.createdAt)}</p>
        {board.soldAt ? <p>Venta: {formatDate(board.soldAt)}</p> : null}
        {board.releaseDate ? <p>Prevista: {formatDate(board.releaseDate)}</p> : null}
        {board.releasedAt ? <p>Confirmada: {formatDate(board.releasedAt)}</p> : null}
        {board.linkedSale ? (
          <p className="font-medium wrap-break-word text-foreground">
            Venta {board.linkedSale.number}
            {board.linkedSale.method ? ` - ${formatCashMethod(board.linkedSale.method)}` : ""}
          </p>
        ) : board.releasedAt ? (
          <p>Liberación histórica sin venta vinculada</p>
        ) : null}
        {board.saleNotes ? <p className="wrap-break-word">{board.saleNotes}</p> : null}
        <BoardSaleHistory events={board.events} />
      </div>
    );
  }

  return (
    <div className="table-shell">
      {feedback ? (
        <p
          className={`status-banner m-4${feedback.success ? "" : "status-banner--error"}`}
          role={feedback.success ? "status" : "alert"}
        >
          {feedback.message}
        </p>
      ) : null}
      <div className="divide-y divide-border xl:hidden">
        {boards.map((board) => (
          <article className="bg-card p-4" key={board.id}>
            {boxNumbers && (board.boxId || !board.isSold) ? (
              <div className="mb-2">
                <BoxLocation
                  number={board.boxId ? boxNumbers.get(board.boxId) : null}
                  sold={board.isSold}
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold wrap-break-word text-foreground">
                  {board.brand} {board.model}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{TYPE_LABELS[board.boardType]}</p>
              </div>
              {renderSaleBadge(board)}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Precio publicado</dt>
                <dd className="mt-1 font-medium wrap-break-word text-foreground tabular-nums">
                  {formatCurrency(board.price)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Neto de venta</dt>
                <dd className="mt-1 font-medium wrap-break-word text-foreground tabular-nums">
                  {board.netAmount === null ? "Sin informar" : formatCurrency(board.netAmount)}
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-muted-foreground">Costo y margen directo</dt>
                <dd className="mt-1 space-y-1 text-muted-foreground">
                  <p>
                    Costo:{" "}
                    {board.acquisitionCost == null
                      ? "Sin informar"
                      : formatCurrency(board.acquisitionCost)}
                  </p>
                  {board.claimStatus !== "none" ? (
                    <p>Excluida del margen directo</p>
                  ) : (
                    <p>
                      Margen directo:{" "}
                      {getTvBoardMargin(board.netAmount, board.acquisitionCost) == null
                        ? "Costo / neto incompleto"
                        : formatCurrency(getTvBoardMargin(board.netAmount, board.acquisitionCost)!)}
                    </p>
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-3">{renderDates(board)}</div>
            <div className="mt-3">{renderActions(board)}</div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto xl:block">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {boxNumbers ? <th className="px-4 py-3 font-medium">Ubicación</th> : null}
              <th className="px-4 py-3 font-medium">Placa</th>
              <th className="px-4 py-3 font-medium">Precio publicado</th>
              <th className="px-4 py-3 font-medium">Neto, costo y margen</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fechas</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr className="border-t border-border bg-card align-top" key={board.id}>
                {boxNumbers ? (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <BoxLocation
                      number={board.boxId ? boxNumbers.get(board.boxId) : null}
                      sold={board.isSold}
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <p className="font-medium wrap-break-word text-foreground">
                    {board.brand} {board.model}
                  </p>
                  <p className="mt-1 text-muted-foreground">{TYPE_LABELS[board.boardType]}</p>
                </td>
                <td className="px-4 py-3 font-medium text-foreground tabular-nums">
                  {formatCurrency(board.price)}
                </td>
                <td className="space-y-1 px-4 py-3 text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Neto:{" "}
                    {board.netAmount === null ? "Sin informar" : formatCurrency(board.netAmount)}
                  </p>
                  <p>
                    Costo:{" "}
                    {board.acquisitionCost == null
                      ? "Sin informar"
                      : formatCurrency(board.acquisitionCost)}
                  </p>
                  {board.claimStatus !== "none" ? (
                    <p>Excluida del margen directo</p>
                  ) : (
                    <p>
                      Margen:{" "}
                      {getTvBoardMargin(board.netAmount, board.acquisitionCost) == null
                        ? "Incompleto"
                        : formatCurrency(getTvBoardMargin(board.netAmount, board.acquisitionCost)!)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">{renderSaleBadge(board)}</td>
                <td className="px-4 py-3">{renderDates(board)}</td>
                <td className="px-4 py-3">{renderActions(board)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!boards.length ? <div className="empty-panel">{emptyMessage}</div> : null}
      {releaseBoard ? (
        <BoardReleaseDialog
          board={releaseBoard}
          onClose={() => setReleaseBoard(null)}
          onSaved={(result) => {
            setReleasedIds((previous) => new Set([...previous, releaseBoard.id]));
            setReleaseBoard(null);
            if (onSaleChanged) onSaleChanged(releaseBoard.id, result.recordVersion, result.message);
            else setFeedback(result);
          }}
          operationIds={operationIds.current}
        />
      ) : null}
    </div>
  );
}
