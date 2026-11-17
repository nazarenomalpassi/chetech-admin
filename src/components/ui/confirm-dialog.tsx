"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

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

export type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const loadDialogView = () =>
  import("./confirm-dialog-view").then((module) => module.ConfirmDialogView);
const ConfirmDialogView = dynamic(loadDialogView, { ssr: false, loading: () => null });
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
    const idle =
      window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    idle(() => void loadDialogView());
  }, []);

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

  // El diálogo (Base UI, unos 20 kB) se descarga en un momento libre y se monta recién con
  // el primer pedido de confirmación.
  if (!request) return null;
  return (
    <ConfirmDialogView
      open={open}
      onOpen={() => setOpen(true)}
      onSettle={settle}
      request={request}
    />
  );
}
