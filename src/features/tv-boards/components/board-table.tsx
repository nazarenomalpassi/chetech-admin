"use client";

import { useTransition } from "react";
import { CircleCheck, Pencil, Power, Trash2, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { deleteTvBoardAction, markTvBoardReleasedAction, toggleTvBoardStatusAction } from "@/features/tv-boards/actions";
import { getTvBoardMargin, type TvBoardSaleStatus, type TvBoardReleaseEvidence } from "@/features/tv-boards/sales";
import { formatCurrency, formatDate } from "@/lib/utils";

type TvBoard = {
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
};

const TYPE_LABELS: Record<TvBoard["boardType"], string> = {
  fuente: "Fuente",
  main: "Main",
  tcom: "Tcom",
  placa_unica: "Placa unica"
};

export function BoardTable({
  boards,
  canManage,
  onEdit,
  onSell
}: {
  boards: TvBoard[];
  canManage: boolean;
  onEdit: (id: string) => void;
  onSell: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(board: TvBoard) {
    const confirmed = window.confirm(
      `Queres eliminar definitivamente la placa ${board.brand} ${board.model}?`
    );

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteTvBoardAction(board.id);
      if (!result.success) {
        window.alert(result.message);
      }
    });
  }

  function handleRelease(board: TvBoard) {
    if (!window.confirm(`Confirmas que Mercado Pago ya libero ${formatCurrency(board.netAmount ?? 0)} por la placa ${board.brand} ${board.model}?`)) return;

    startTransition(async () => {
      const result = await markTvBoardReleasedAction(board.id);
      if (!result.success) window.alert(result.message);
    });
  }

  function renderSaleBadge(board: TvBoard) {
    if (!board.isSold) {
      return <Badge variant={board.isActive ? "success" : "default"}>{board.isActive ? "Disponible" : "Baja"}</Badge>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Badge className="border-slate-200 bg-slate-100 text-slate-700" variant="default">
          Vendida
        </Badge>
        <Badge variant={board.releaseEvidence === "confirmed" ? "success" : "warning"}>
          {board.releaseEvidence === "confirmed" ? "Liberacion confirmada" : board.releaseEvidence === "estimated_due" ? "Fecha prevista cumplida; sin confirmar" : "Liberacion sin confirmar"}
        </Badge>
      </div>
    );
  }

  function renderActions(board: TvBoard) {
    if (!canManage) return <p className="text-sm text-slate-500">Solo administracion</p>;
    return (
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <Button onClick={() => onEdit(board.id)} size="sm" type="button" variant="secondary">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {!board.isSold ? (
          <Button disabled={isPending} onClick={() => onSell(board.id)} size="sm" type="button">
            <WalletCards className="h-4 w-4" />
            Registrar venta
          </Button>
        ) : null}
        {board.isSold && board.releaseEvidence !== "confirmed" ? (
          <Button disabled={isPending} onClick={() => handleRelease(board)} size="sm" type="button" variant="secondary">
            <CircleCheck className="h-4 w-4" />
            Confirmar liberacion
          </Button>
        ) : null}
        <ActionMenu label="Mas acciones">
          {!board.isSold ? (
            <Button disabled={isPending} onClick={() => startTransition(async () => {
              const result = await toggleTvBoardStatusAction(board.id, !board.isActive);
              if (!result.success) window.alert(result.message);
            })} size="sm" type="button" variant="ghost">
              <Power className="h-4 w-4" />
              {board.isActive ? "Dar de baja" : "Reactivar"}
            </Button>
          ) : null}
          <Button disabled={isPending || board.isSold} onClick={() => handleDelete(board)} size="sm" type="button" variant="danger">
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        </ActionMenu>
      </div>
    );
  }

  function renderDates(board: TvBoard) {
    return (
      <div className="space-y-1 text-sm text-slate-600">
        <p>Alta: {formatDate(board.createdAt)}</p>
        {board.soldAt ? <p>Venta: {formatDate(board.soldAt)}</p> : null}
        {board.releaseDate ? <p>Prevista: {formatDate(board.releaseDate)}</p> : null}
        {board.releasedAt ? <p>Confirmada: {formatDate(board.releasedAt)}</p> : null}
        {board.saleNotes ? <p className="break-words">{board.saleNotes}</p> : null}
      </div>
    );
  }

  return (
    <div className="table-shell">
      <div className="divide-y divide-slate-200 xl:hidden">
        {boards.map((board) => (
          <article className="bg-white p-4" key={board.id}>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-950">{board.brand} {board.model}</p>
                <p className="mt-1 text-sm text-slate-600">{TYPE_LABELS[board.boardType]}</p>
              </div>
              {renderSaleBadge(board)}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0">
                <dt className="text-slate-500">Precio publicado</dt>
                <dd className="mt-1 break-words font-medium tabular-nums text-slate-950">{formatCurrency(board.price)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Neto de venta</dt>
                <dd className="mt-1 break-words font-medium tabular-nums text-slate-950">{board.netAmount === null ? "Sin informar" : formatCurrency(board.netAmount)}</dd>
              </div>
              <div className="min-w-0 col-span-2">
                <dt className="text-slate-500">Costo y margen directo</dt>
                <dd className="mt-1 space-y-1 text-slate-600">
                  <p>Costo: {board.acquisitionCost == null ? "Sin informar" : formatCurrency(board.acquisitionCost)}</p>
                  <p>Margen directo: {getTvBoardMargin(board.netAmount, board.acquisitionCost) == null ? "Costo / neto incompleto" : formatCurrency(getTvBoardMargin(board.netAmount, board.acquisitionCost)!)}</p>
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
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
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
              <tr className="border-t border-slate-200 bg-white align-top" key={board.id}>
                <td className="px-4 py-3">
                  <p className="break-words font-medium text-slate-950">{board.brand} {board.model}</p>
                  <p className="mt-1 text-slate-600">{TYPE_LABELS[board.boardType]}</p>
                </td>
                <td className="px-4 py-3 font-medium tabular-nums text-slate-950">{formatCurrency(board.price)}</td>
                <td className="space-y-1 px-4 py-3 text-slate-600">
                  <p className="font-medium text-slate-950">Neto: {board.netAmount === null ? "Sin informar" : formatCurrency(board.netAmount)}</p>
                  <p>Costo: {board.acquisitionCost == null ? "Sin informar" : formatCurrency(board.acquisitionCost)}</p>
                  <p>Margen: {getTvBoardMargin(board.netAmount, board.acquisitionCost) == null ? "Incompleto" : formatCurrency(getTvBoardMargin(board.netAmount, board.acquisitionCost)!)}</p>
                </td>
                <td className="px-4 py-3">{renderSaleBadge(board)}</td>
                <td className="px-4 py-3">{renderDates(board)}</td>
                <td className="px-4 py-3">{renderActions(board)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!boards.length ? <div className="empty-panel">No hay placas con estos filtros. Proba otra busqueda o cambia el estado.</div> : null}
    </div>
  );
}
