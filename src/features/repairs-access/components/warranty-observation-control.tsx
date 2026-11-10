"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { CoordinationDialog } from "./order-coordination-panel";
import { startWarrantyObservation } from "../operational-metrics-actions";

export function WarrantyObservationControl({
  startedOn,
}: {
  startedOn: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      {startedOn ? (
        <p className="text-slate-600">
          Seguimiento comparable de garantias iniciado el{" "}
          {formatDate(startedOn)}. Solo compara garantias observadas por
          completo desde esa fecha.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-slate-600">
            Las tasas de garantia necesitan un periodo de registro completo. Los
            casos antiguos sin reingresos registrados no se interpretan como
            cero fallas.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => setOpen(true)}
          >
            Iniciar seguimiento comparable
          </Button>
        </div>
      )}
      {open ? (
        <CoordinationDialog
          title="Iniciar seguimiento de garantias"
          action={startWarrantyObservation}
          onClose={() => setOpen(false)}
        >
          <p className="text-sm text-slate-600">
            No modifica ninguna orden ni fecha historica. Se conserva la fecha
            real de inicio y no se puede retroceder. La tasa necesita esperar a
            que venzan las primeras garantias observadas completas.
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              required
              name="confirmObservation"
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-graphite"
            />
            Confirmo que desde hoy registraremos todos los reingresos por
            garantia en CHETECH.
          </label>
        </CoordinationDialog>
      ) : null}
    </aside>
  );
}
