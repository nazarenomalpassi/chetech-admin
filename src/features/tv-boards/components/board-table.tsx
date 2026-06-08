"use client";

import { useTransition } from "react";
import { Pencil, Power, Trash2, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteTvBoardAction, toggleTvBoardStatusAction } from "@/features/tv-boards/actions";
import type { TvBoardSaleStatus } from "@/features/tv-boards/sales";
import { formatCurrency, formatDate } from "@/lib/utils";

type TvBoard = {
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

  function renderSaleBadge(board: TvBoard) {
    if (!board.isSold) {
      return <Badge variant={board.isActive ? "success" : "default"}>{board.isActive ? "Disponible" : "Baja"}</Badge>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Badge className="border-slate-200 bg-slate-100 text-slate-700" variant="default">
          Vendida
        </Badge>
        <Badge variant={board.saleStatus === "released" ? "success" : "warning"}>
          {board.saleStatus === "released" ? "Liberada" : "En espera de liberacion"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="panel-kicker">Stock tecnico</p>
            <h2 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">
              Registro de placas
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Marca, modelo, tipo, precio publicado y estado en una tabla lista para operar rapido.
          </p>
        </div>
      </div>

      <div className="grid gap-3 p-3 lg:hidden">
        {boards.map((board) => (
          <article className="rounded-[24px] border border-graphite/8 bg-white/86 p-4 shadow-[0_10px_20px_rgba(20,20,19,0.04)]" key={board.id}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">{board.brand}</p>
                <p className="mt-1 break-words text-sm text-slate-600">{board.model}</p>
              </div>
              <Badge variant="default">{TYPE_LABELS[board.boardType]}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Publicado</p>
                <p className="mt-1 font-semibold text-slate-950">{formatCurrency(board.price)}</p>
              </div>
              <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Neto real</p>
                <p className="mt-1 font-semibold text-slate-950">
                  {board.netAmount === null ? "-" : formatCurrency(board.netAmount)}
                </p>
              </div>
              <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Alta</p>
                <p className="mt-1 font-semibold text-slate-800">{formatDate(board.createdAt)}</p>
              </div>
              <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Stock</p>
                <div className="mt-1"><Badge variant={board.isActive ? "success" : "default"}>{board.isActive ? "Activa" : "Baja"}</Badge></div>
              </div>
            </div>

            <div className="mt-3">{renderSaleBadge(board)}</div>
            {board.releaseDate ? (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Liberacion {formatDate(board.releaseDate)}. {board.saleStatus === "released" ? "Dinero disponible" : "Retenido por Mercado Pago"}
              </p>
            ) : null}
            {board.saleNotes ? <p className="mt-2 text-xs leading-5 text-slate-500">{board.saleNotes}</p> : null}

            {canManage ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={() => onEdit(board.id)} variant="secondary">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
                {!board.isSold ? (
                  <Button className="w-full" disabled={isPending} onClick={() => onSell(board.id)}>
                    <WalletCards className="h-4 w-4" />
                    Vendida
                  </Button>
                ) : (
                  <Button className="w-full" disabled variant="secondary">
                    <WalletCards className="h-4 w-4" />
                    Venta cargada
                  </Button>
                )}
                {!board.isSold ? (
                  <Button
                    className="w-full"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await toggleTvBoardStatusAction(board.id, !board.isActive);
                        if (!result.success) {
                          window.alert(result.message);
                        }
                      })
                    }
                    variant="ghost"
                  >
                    <Power className="h-4 w-4" />
                    {board.isActive ? "Dar de baja" : "Reactivar"}
                  </Button>
                ) : null}
                <Button className="w-full" disabled={isPending} onClick={() => handleDelete(board)} variant="danger">
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              </div>
            ) : (
              <p className="mt-4 rounded-[18px] bg-brand-50 px-3 py-2 text-sm text-slate-500">Solo administracion</p>
            )}
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full text-sm">
          <thead className="bg-white/80 text-left text-slate-500">
            <tr>
              <th className="px-4 py-4 font-medium sm:px-5">Marca</th>
              <th className="px-4 py-4 font-medium">Modelo</th>
              <th className="px-4 py-4 font-medium">Tipo</th>
              <th className="px-4 py-4 font-medium">Precio publicado</th>
              <th className="px-4 py-4 font-medium">Venta ML</th>
              <th className="px-4 py-4 font-medium">Neto real</th>
              <th className="px-4 py-4 font-medium">Liberacion</th>
              <th className="px-4 py-4 font-medium">Stock</th>
              <th className="px-4 py-4 font-medium">Alta</th>
              <th className="px-4 py-4 font-medium text-right sm:px-5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white" key={board.id}>
                <td className="px-4 py-4 font-medium text-slate-950 sm:px-5">{board.brand}</td>
                <td className="px-4 py-4 text-slate-600">{board.model}</td>
                <td className="px-4 py-4">
                  <Badge variant="default">{TYPE_LABELS[board.boardType]}</Badge>
                </td>
                <td className="px-4 py-4 font-medium text-slate-950">{formatCurrency(board.price)}</td>
                <td className="px-4 py-4">
                  {renderSaleBadge(board)}
                </td>
                <td className="px-4 py-4 font-medium text-slate-950">
                  {board.netAmount === null ? <span className="text-slate-400">-</span> : formatCurrency(board.netAmount)}
                </td>
                <td className="px-4 py-4 text-slate-600">
                  {board.releaseDate ? (
                    <div>
                      <p>{formatDate(board.releaseDate)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {board.saleStatus === "released" ? "Dinero disponible" : "Retenido por Mercado Pago"}
                      </p>
                      {board.saleNotes ? (
                        <p className="mt-2 max-w-[16rem] text-xs leading-5 text-slate-500">{board.saleNotes}</p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <Badge variant={board.isActive ? "success" : "default"}>
                    {board.isActive ? "Activa" : "Baja"}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-slate-600">{formatDate(board.createdAt)}</td>
                <td className="px-4 py-4 sm:px-5">
                  {canManage ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button onClick={() => onEdit(board.id)} size="sm" variant="secondary">
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      {!board.isSold ? (
                        <Button disabled={isPending} onClick={() => onSell(board.id)} size="sm">
                          <WalletCards className="mr-2 h-4 w-4" />
                          Vendida
                        </Button>
                      ) : (
                        <Button disabled size="sm" variant="secondary">
                          <WalletCards className="mr-2 h-4 w-4" />
                          Venta cargada
                        </Button>
                      )}
                      {!board.isSold ? (
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await toggleTvBoardStatusAction(board.id, !board.isActive);
                              if (!result.success) {
                                window.alert(result.message);
                              }
                            })
                          }
                          size="sm"
                          variant="ghost"
                        >
                          <Power className="mr-2 h-4 w-4" />
                          {board.isActive ? "Dar de baja" : "Reactivar"}
                        </Button>
                      ) : null}
                      <Button disabled={isPending} onClick={() => handleDelete(board)} size="sm" variant="danger">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  ) : (
                    <p className="text-right text-xs text-slate-500">Solo administracion</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!boards.length ? (
        <div className="empty-panel border-t border-graphite/8">
          Todavia no cargaste placas. Cuando agregues la primera, vas a verla aca con su estado y valor.
        </div>
      ) : null}
    </div>
  );
}
