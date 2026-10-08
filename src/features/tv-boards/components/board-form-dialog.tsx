"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
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
  acquisitionCost: null,
  isActive: true
};

export function BoardFormDialog({ board, open, onClose }: BoardFormDialogProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TvBoardFormValues>({
    resolver: zodResolver(tvBoardSchema),
    defaultValues
  });
  const hasChanges = form.formState.isDirty;

  useEffect(() => {
    form.reset(board ?? defaultValues);
    setMessage(null);
  }, [board, form, open]);

  if (!open) {
    return null;
  }

  function requestClose() {
    if (hasChanges && !window.confirm("Descartar los cambios de la placa?")) return;
    onClose();
  }

  return (
    <DialogShell labelledBy="board-dialog-title" onClose={requestClose} panelClassName="max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950" id="board-dialog-title">
                {board?.id ? "Editar placa" : "Nueva placa"}
              </h2>
          </div>
          <button
            aria-label="Cerrar formulario de placa"
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
              const result = await upsertTvBoardAction(values);
              setMessage(result.message);
              if (result.success) {
                onClose();
              }
            })
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="brand">Marca</label>
              <Input {...form.register("brand")} placeholder="Ej: Samsung" />
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.brand?.message}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="model">Modelo</label>
              <Input {...form.register("model")} placeholder="Ej: UN50AU7000" />
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.model?.message}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="boardType">Tipo de placa</label>
              <Select
                id="boardType"
                options={TV_BOARD_TYPES.map((type) => ({ label: type.label, value: type.value }))}
                value={form.watch("boardType")}
                onChange={(event) =>
                  form.setValue("boardType", event.target.value as TvBoardFormValues["boardType"], { shouldDirty: true })
                }
              />
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.boardType?.message}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="price">Precio publicado</label>
              <Input step="0.01" type="number" {...form.register("price", { valueAsNumber: true })} />
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.price?.message}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="acquisitionCost">Costo de compra / recuperacion</label>
              <Input id="acquisitionCost" type="number" step="0.01" min="0" value={form.watch("acquisitionCost") ?? ""} onChange={(event) => form.setValue("acquisitionCost", event.target.value === "" ? null : Number(event.target.value), { shouldValidate: true, shouldDirty: true })} />
              <p className="mt-1 text-sm text-finance-expense">{form.formState.errors.acquisitionCost?.message}</p>
              <p className="mt-1 text-sm text-slate-500">Vacio: costo desconocido. Cero: costo confirmado. No registra un egreso.</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="isActive">Estado</label>
              <Select
                id="isActive"
                options={[
                  { label: "Activa", value: "true" },
                  { label: "Dada de baja", value: "false" }
                ]}
                value={String(form.watch("isActive"))}
                onChange={(event) => form.setValue("isActive", event.target.value === "true", { shouldDirty: true })}
              />
              <p className="mt-2 text-sm text-slate-500">La baja conserva el historial.</p>
            </div>
          </div>

          {message ? (
            <div className="status-banner status-banner--error" role="alert">
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-graphite/8 pt-5 sm:flex-row sm:justify-end">
            <Button onClick={requestClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Guardando..." : board?.id ? "Actualizar placa" : "Crear placa"}
            </Button>
          </div>
        </form>
    </DialogShell>
  );
}
