"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircuitBoard, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { upsertTvBoardAction } from "@/features/tv-boards/actions";
import { TV_BOARD_TYPES, tvBoardSchema, type TvBoardFormValues } from "@/features/tv-boards/schemas";

type BoardFormDialogProps = {
  board?: TvBoardFormValues | null;
  open: boolean;
  onClose: () => void;
};

const defaultValues: TvBoardFormValues = {
  brand: "",
  model: "",
  boardType: "fuente",
  price: 0,
  isActive: true
};

export function BoardFormDialog({ board, open, onClose }: BoardFormDialogProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TvBoardFormValues>({
    resolver: zodResolver(tvBoardSchema),
    defaultValues
  });

  useEffect(() => {
    form.reset(board ?? defaultValues);
    setMessage(null);
  }, [board, form]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,15,15,0.42)] p-4 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-[32px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,247,243,0.96))] p-6 shadow-[0_30px_90px_rgba(20,20,19,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-graphite/8 bg-brand-100 text-graphite">
              <CircuitBoard className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="panel-kicker">Placas de televisores</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-graphite/8 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  Registro limpio
                </span>
              </div>
              <h3 className="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950">
                {board?.id ? "Editar placa" : "Nueva placa"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Carga marca, modelo, tipo y precio publicado con una ficha mas clara para compra, desarme o reventa.
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
              const result = await upsertTvBoardAction(values);
              setMessage(result.message);
              if (result.success) {
                onClose();
              }
            })
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Marca</label>
              <Input {...form.register("brand")} placeholder="Ej: Samsung" />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.brand?.message}</p>
            </div>
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Modelo</label>
              <Input {...form.register("model")} placeholder="Ej: UN50AU7000" />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.model?.message}</p>
            </div>
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Tipo de placa</label>
              <Select
                options={TV_BOARD_TYPES.map((type) => ({ label: type.label, value: type.value }))}
                value={form.watch("boardType")}
                onChange={(event) =>
                  form.setValue("boardType", event.target.value as TvBoardFormValues["boardType"])
                }
              />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.boardType?.message}</p>
            </div>
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Precio publicado</label>
              <Input step="0.01" type="number" {...form.register("price", { valueAsNumber: true })} />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.price?.message}</p>
            </div>
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4 md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Estado</label>
              <Select
                options={[
                  { label: "Activa", value: "true" },
                  { label: "Dada de baja", value: "false" }
                ]}
                value={String(form.watch("isActive"))}
                onChange={(event) => form.setValue("isActive", event.target.value === "true")}
              />
              <p className="mt-2 text-xs text-slate-500">
                Si se vende o deja de usarse, podes darla de baja sin perder el historial del registro.
              </p>
            </div>
          </div>

          {message ? (
            <div className={message.toLowerCase().includes("error") ? "status-banner status-banner--error" : "status-banner status-banner--success"}>
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-graphite/8 pt-5 sm:flex-row sm:justify-end">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Guardando..." : board?.id ? "Actualizar placa" : "Crear placa"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
