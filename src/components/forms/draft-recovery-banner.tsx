"use client";

import { Clock3, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DraftRecoveryBanner({
  onDiscard,
  onRestore,
  updatedAt
}: {
  onDiscard: () => void;
  onRestore: () => void;
  updatedAt: string;
}) {
  const timestamp = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(updatedAt));

  return (
    <section
      aria-labelledby="draft-recovery-title"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
      role="status"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Clock3 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="font-semibold" id="draft-recovery-title">Encontramos datos sin guardar</h2>
            <p className="mt-1 text-sm leading-5 text-amber-900">
              El borrador se guardó en este dispositivo el {timestamp}. Podés recuperarlo o descartarlo.
            </p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <Button onClick={onRestore} size="sm" type="button">
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Recuperar
          </Button>
          <Button onClick={onDiscard} size="sm" type="button" variant="secondary">
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Descartar
          </Button>
        </div>
      </div>
    </section>
  );
}
