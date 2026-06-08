"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, WalletCards, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    form.reset(buildDefaultValues(board));
    setMessage(null);
  }, [board, form, open]);

  if (!open || !board) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(15,15,15,0.42)] px-3 py-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-4">
      <div className="max-h-[calc(100svh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,247,243,0.96))] p-4 shadow-[0_30px_90px_rgba(20,20,19,0.18)] sm:rounded-[32px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-graphite/8 bg-finance-profitSoft text-finance-profit">
              <WalletCards className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="panel-kicker">Venta Mercado Libre</p>
              <h3 className="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950">
                Marcar placa como vendida
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Guarda el dinero neto real que vas a recibir y la fecha en la que Mercado Pago lo libera.
              </p>
              <p className="mt-3 text-sm font-medium text-slate-950">
                {board.brand} <span className="text-slate-500">{board.model}</span>
              </p>
            </div>
          </div>
          <button
            className="rounded-full p-2 text-slate-500 transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="mt-6 space-y-5"
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-[26px] border border-graphite/8 bg-brand-50/90 p-5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Precio publicado
              </p>
              <p className="mt-4 text-[2rem] font-semibold tracking-[-0.05em] text-slate-950">
                {formatCurrency(board.price)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Este importe es solo de referencia. Las metricas financieras se calculan con el neto real.
              </p>
            </div>

            <div className="rounded-[26px] border border-graphite/8 bg-white/92 p-5">
              <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <CalendarClock className="h-4 w-4" />
                Liberacion estimada
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Si la fecha todavia no llego, la placa queda en espera de liberacion. Cuando llegue, pasa a liberada.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Plata final con retenciones de MercadoLibre
              </label>
              <Input
                min={0}
                step="0.01"
                type="number"
                {...form.register("netAmount", { valueAsNumber: true })}
              />
              <p className="mt-2 text-xs text-slate-500">
                Ingresa solo el dinero real final que efectivamente vas a cobrar.
              </p>
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.netAmount?.message}</p>
            </div>

            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Fecha de liberacion del dinero</label>
              <Input type="date" {...form.register("releaseDate")} />
              <p className="mt-2 text-xs text-slate-500">
                Esta fecha define si el dinero aparece pendiente o ya liberado en las KPI.
              </p>
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.releaseDate?.message}</p>
            </div>

            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4 md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
              <Textarea placeholder="Ej: envio demorado, venta express, devolucion, cliente habitual..." {...form.register("notes")} />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.notes?.message}</p>
            </div>
          </div>

          {message ? (
            <div
              className={
                message.toLowerCase().includes("no") || message.toLowerCase().includes("error")
                  ? "status-banner status-banner--error"
                  : "status-banner status-banner--success"
              }
            >
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-graphite/8 pt-5 sm:flex-row sm:justify-end">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Confirmando..." : "Confirmar venta"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
