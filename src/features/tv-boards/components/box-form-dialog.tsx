"use client";

import { useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { createTvBoardBoxAction, updateTvBoardBoxAction } from "@/features/tv-boards/box-actions";
import type { TvBoardBox } from "@/features/tv-boards/model";

/** Alta y edición de una caja. El número lo asigna la base: siempre el que sigue. */
export function BoxFormDialog({
  open,
  box,
  nextNumber,
  onClose
}: {
  open: boolean;
  box?: Pick<TvBoardBox, "id" | "number" | "label"> | null;
  nextNumber: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLabel(box?.label ?? "");
    setError(null);
  }, [box, open]);

  if (!open) return null;

  const editing = Boolean(box?.id);
  const number = box?.number ?? nextNumber;

  return (
    <DialogShell labelledBy="box-dialog-title" onClose={onClose} panelClassName="max-w-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground" id="box-dialog-title">
            {editing ? `Editar caja ${number}` : "Nueva caja"}
          </h2>
          {!editing ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Va a ser la <span className="font-semibold text-foreground">Caja {number}</span>.
              Escribí ese número en la caja para encontrarla después.
            </p>
          ) : null}
        </div>
        <button
          aria-label="Cerrar"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = editing
              ? await updateTvBoardBoxAction({ id: box!.id, label })
              : await createTvBoardBoxAction({ label });
            if (!result.success) {
              setError(result.message);
              return;
            }
            toast.success(result.message);
            onClose();
            if (!editing && result.number) router.push(`/placas-tv?caja=${result.number}` as Route);
          });
        }}
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-body" htmlFor="box-label">
            Descripción o ubicación <span className="text-muted-foreground">(opcional)</span>
          </label>
          <Input
            autoFocus
            id="box-label"
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ej: estante de arriba, placas grandes"
            value={label}
          />
        </div>

        {error ? (
          <p className="status-banner status-banner--error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button loading={isPending} type="submit">
            {editing ? "Guardar cambios" : `Crear caja ${number}`}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
