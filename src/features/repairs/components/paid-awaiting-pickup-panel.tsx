"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmThen } from "@/components/ui/confirm-dialog";
import {
  markPaidOrdersPickedUpAction,
  type BulkPickupResult
} from "@/features/repairs-access/pickup-actions";
import type { PaidOrderAwaitingPickup } from "@/features/repairs-access/pickup-server";
import { formatDate } from "@/lib/utils";

/**
 * Órdenes ya cobradas que siguen figurando para retirar. Sirve para ponerse al día con
 * las que el cliente se llevó sin que se registrara la entrega, y como recordatorio de
 * las que se cobraron con "No, todavía no".
 */
export function PaidAwaitingPickupPanel({ orders }: { orders: PaidOrderAwaitingPickup[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<BulkPickupResult | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!orders.length && !result) return null;

  const allSelected = orders.length > 0 && orders.every((order) => selected.has(order.id));
  const count = selected.size;

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function markSelected() {
    const ids = orders.filter((order) => selected.has(order.id)).map((order) => order.id);
    if (!ids.length) return;
    confirmThen(
      {
        title:
          ids.length === 1
            ? "¿Marcar 1 orden como retirada?"
            : `¿Marcar ${ids.length} órdenes como retiradas?`,
        description:
          "Se registra la entrega a nombre de cada cliente con la fecha de hoy, y la garantía corre desde hoy.",
        confirmLabel: "Marcar como retiradas",
        cancelLabel: "Volver"
      },
      () =>
        startTransition(async () => {
          try {
            const outcome = await markPaidOrdersPickedUpAction(ids);
            setResult(outcome);
            if (outcome.done) {
              setSelected(new Set());
              router.refresh();
            }
          } catch {
            setResult({
              success: false,
              message: "No se pudo confirmar el retiro. Actualizá la página y revisá la lista.",
              done: 0,
              failed: []
            });
          }
        })
    );
  }

  return (
    <Card>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-base font-semibold text-foreground">
              Cobradas sin retiro registrado
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {orders.length === 0
                ? "No quedan órdenes cobradas pendientes de retiro."
                : orders.length === 1
                  ? "1 orden ya cobrada sigue figurando para retirar."
                  : `${orders.length} órdenes ya cobradas siguen figurando para retirar.`}
            </span>
          </span>
          {orders.length ? (
            <Badge variant="warning" className="shrink-0 tabular-nums">
              {orders.length}
            </Badge>
          ) : null}
        </summary>

        <div className="mt-3 grid min-w-0 gap-3 border-t border-border pt-3">
          {result ? (
            <div
              role={result.success ? "status" : "alert"}
              className={
                result.success
                  ? "status-banner status-banner--success"
                  : "status-banner status-banner--error"
              }
            >
              <p>{result.message}</p>
              {result.failed.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {result.failed.map((failure, index) => (
                    <li key={`${failure.repairNumber}-${index}`}>
                      <span className="font-mono">{failure.repairNumber}</span>: {failure.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {orders.length ? (
            <>
              <p className="text-sm text-muted-foreground">
                Marcá las que el cliente ya se llevó. Las que todavía están en el local, dejalas sin
                marcar y registrá la entrega desde la ficha cuando las retiren.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={pending}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked ? new Set(orders.map((order) => order.id)) : new Set()
                      )
                    }
                  />
                  Seleccionar todas
                </label>
                <Button
                  type="button"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!count || pending}
                  loading={pending}
                  onClick={markSelected}
                >
                  {pending
                    ? "Marcando..."
                    : count
                      ? `Marcar como retiradas (${count})`
                      : "Marcar como retiradas"}
                </Button>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {orders.map((order) => (
                  <li key={order.id} className="flex min-w-0 items-start gap-3 px-3 py-2">
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selected.has(order.id)}
                        disabled={pending}
                        onChange={(event) => toggle(order.id, event.target.checked)}
                        aria-label={`Marcar ${order.repairNumber} de ${order.customerName}`}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono font-semibold text-foreground">
                            {order.repairNumber}
                          </span>
                          <span className="wrap-break-word text-foreground">
                            {order.customerName}
                          </span>
                        </span>
                        <span className="mt-0.5 block wrap-break-word text-muted-foreground">
                          {order.device}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {order.paidAt
                            ? `Cobrada el ${formatDate(order.paidAt)}`
                            : "Cobrada, sin fecha de cobro"}
                        </span>
                      </span>
                    </label>
                    <Link
                      href={`/reparaciones-access?view=detalle&order=${order.id}` as Route}
                      className="flex min-h-11 shrink-0 items-center text-sm font-medium underline underline-offset-4"
                    >
                      Ver ficha
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </details>
    </Card>
  );
}
