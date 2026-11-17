"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  /** Pregunta en una línea: "¿Anular la orden REP-000600?" */
  title: string;
  /** Qué pasa si se confirma. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger para anular, eliminar o descartar. */
  tone?: "default" | "danger";
};

type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };
type ConfirmHost = (request: ConfirmRequest) => void;

let host: ConfirmHost | null = null;

function nativeMessage(options: ConfirmOptions) {
  return options.description ? `${options.title}\n\n${options.description}` : options.title;
}

/**
 * Pide confirmación y ejecuta onConfirm si se acepta.
 * Con el ConfirmProvider montado muestra el diálogo de la aplicación; sin él (por ejemplo,
 * en pruebas de un componente aislado) usa la confirmación nativa de forma sincrónica.
 */
export function confirmThen(options: ConfirmOptions, onConfirm: () => void, onCancel?: () => void) {
  if (!host) {
    if (window.confirm(nativeMessage(options))) onConfirm();
    else onCancel?.();
    return;
  }
  host({
    ...options,
    resolve: (confirmed) => (confirmed ? onConfirm() : onCancel?.())
  });
}

/**
 * Para usar en onSubmit: frena el envío, pide confirmación y, si se acepta, vuelve a enviar
 * el formulario con el mismo botón. Conserva las acciones de servidor del formulario.
 */
export function confirmSubmit(event: FormEvent<HTMLFormElement>, options: ConfirmOptions) {
  const form = event.currentTarget;
  if (form.dataset.confirmed === "true") {
    delete form.dataset.confirmed;
    return;
  }
  if (!host) {
    if (!window.confirm(nativeMessage(options))) event.preventDefault();
    return;
  }
  event.preventDefault();
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  confirmThen(options, () => {
    form.dataset.confirmed = "true";
    form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined);
  });
}

export function ConfirmProvider() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [open, setOpen] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    host = (next) => {
      settledRef.current = false;
      setRequest(next);
      setOpen(true);
    };
    return () => {
      host = null;
    };
  }, []);

  const settle = useCallback(
    (confirmed: boolean) => {
      if (!request || settledRef.current) return;
      settledRef.current = true;
      setOpen(false);
      request.resolve(confirmed);
    },
    [request]
  );

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : settle(false))}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-pop transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="space-y-2">
            <AlertDialog.Title className="text-lg leading-snug font-semibold text-foreground">
              {request?.title}
            </AlertDialog.Title>
            {request?.description ? (
              <AlertDialog.Description className="text-sm leading-6 text-muted-foreground">
                {request.description}
              </AlertDialog.Description>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => settle(false)}>
              {request?.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              type="button"
              variant={request?.tone === "danger" ? "danger" : "default"}
              onClick={() => settle(true)}
              autoFocus
            >
              {request?.confirmLabel ?? "Confirmar"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
