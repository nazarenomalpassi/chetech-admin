"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import { Button } from "@/components/ui/button";
import type { ConfirmRequest } from "./confirm-dialog";

export function ConfirmDialogView({
  request,
  open,
  onOpen,
  onSettle
}: {
  request: ConfirmRequest;
  open: boolean;
  onOpen: () => void;
  onSettle: (confirmed: boolean) => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (next ? onOpen() : onSettle(false))}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-pop transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="space-y-2">
            <AlertDialog.Title className="text-lg leading-snug font-semibold text-foreground">
              {request.title}
            </AlertDialog.Title>
            {request.description ? (
              <AlertDialog.Description className="text-sm leading-6 text-muted-foreground">
                {request.description}
              </AlertDialog.Description>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => onSettle(false)}>
              {request.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              type="button"
              variant={request.tone === "danger" ? "danger" : "default"}
              onClick={() => onSettle(true)}
              autoFocus
            >
              {request.confirmLabel ?? "Confirmar"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
