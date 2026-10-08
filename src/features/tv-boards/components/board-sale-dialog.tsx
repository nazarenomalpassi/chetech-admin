"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { markTvBoardSoldAction } from "@/features/tv-boards/actions";
import { tvBoardSaleSchema, type TvBoardSaleFormValues } from "@/features/tv-boards/schemas";
import { formatCurrency, getLocalDateInputValue } from "@/lib/utils";

type BoardSaleDialogProps = {
  board?: {
    id: string;
    brand: string;
    model: string;
    price: number;
  } | null;
  open: boolean;
  onClose: () => void;
};

function buildDefaultValues(board?: BoardSaleDialogProps["board"]): TvBoardSaleFormValues {
  return {
    id: board?.id ?? "00000000-0000-0000-0000-000000000000",
    netAmount: board?.price ?? 0,
    releaseDate: getLocalDateInputValue(),
    notes: ""
  };
}

export function BoardSaleDialog({ board, open, onClose }: BoardSaleDialogProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TvBoardSaleFormValues>({
    resolver: zodResolver(tvBoardSaleSchema),
    defaultValues: buildDefaultValues(board)
  });
  const hasChanges = form.formState.isDirty;

  useEffect(() => {
    form.reset(buildDefaultValues(board));
    setMessage(null);
  }, [board, form, open]);

  if (!open || !board) {
    return null;
  }

  function requestClose() {
    if (hasChanges && !window.confirm("Descartar los cambios de la venta?")) return;
    onClose();
  }

  return (
    <DialogShell labelledBy="board-sale-dialog-title" onClose={requestClose} panelClassName="max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950" id="board-sale-dialog-title">
                Registrar venta de placa
              </h2>
              <p className="mt-2 break-words text-sm font-medium text-slate-950">
                {board.brand} <span className="text-slate-500">{board.model}</span>
              </p>
          </div>
          <button
            aria-label="Cerrar registro de venta"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={requestClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const result = await markTvBoardSoldAction(values);
              setMessage(result.message);

              if (result.success) {
                onClose();
              }
            })
          )}
        >
          <p className="border-y border-slate-200 py-3 text-sm text-slate-600">Precio publicado: <span className="font-medium text-slate-950">{formatCurrency(board.price)}</span>. Solo de referencia; el neto se informa abajo.</p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="netAmount">
                Neto de venta
              </label>
              <Input
                id="netAmount"
                min={0}
                step="0.01"
                type="number"
                {...form.register("netAmount", { valueAsNumber: true })}
              />
              <p className="mt-2 text-sm text-slate-500">
                Importe a recibir despues de comisiones y retenciones. No es ganancia.
              </p>
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.netAmount?.message}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="releaseDate">Fecha prevista de liberacion</label>
              <Input id="releaseDate" type="date" {...form.register("releaseDate")} />
              <p className="mt-2 text-sm text-slate-500">
                La fecha no confirma el deposito. Confirma la liberacion cuando Mercado Pago la informe.
              </p>
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.releaseDate?.message}</p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="notes">Observaciones</label>
              <Textarea id="notes" rows={2} placeholder="Nota interna (opcional)" {...form.register("notes")} />
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.notes?.message}</p>
            </div>
          </div>

          {message ? (
            <div
              aria-live="polite"
              className="status-banner status-banner--error"
              role="alert"
            >
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-graphite/8 pt-5 sm:flex-row sm:justify-end">
            <Button onClick={requestClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Confirmando..." : "Confirmar venta"}
            </Button>
          </div>
        </form>
    </DialogShell>
  );
}
