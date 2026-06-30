"use client";

import { ArrowRightLeft, Ban, History, Repeat2, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveBalanceTransferAction, voidBalanceTransferAction } from "@/features/balance-transfers/actions";
import {
  formatBalanceTransferMethod,
  getBalanceTransferMethodOptions
} from "@/features/balance-transfers/model";
import type {
  BalanceTransferRecord,
  BalanceTransferSummary
} from "@/features/balance-transfers/queries";
import type { ActionResult } from "@/lib/form-state";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

export function BalanceTransfersView({
  message,
  summary,
  transfers
}: {
  message: ActionResult | null;
  summary: BalanceTransferSummary;
  transfers: BalanceTransferRecord[];
}) {
  const methodOptions = getBalanceTransferMethodOptions();
  const today = getLocalDateInputValue();

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="panel-kicker">Movimiento interno</p>
            <h1 className="panel-heading mt-3">Cambio de balance</h1>
            <p className="panel-subheading mt-3">
              Mueve dinero entre Efectivo, NX SANTI y NX LOCAL sin alterar ventas, gastos ni ganancias.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[36rem]">
            <MetricCard icon={<ArrowRightLeft className="h-4 w-4" />} label="Activos" value={summary.activeCount.toString()} />
            <MetricCard icon={<WalletCards className="h-4 w-4" />} label="Movido activo" value={formatCurrency(summary.totalActive)} />
            <MetricCard icon={<Ban className="h-4 w-4" />} label="Anulado" value={formatCurrency(summary.totalVoided)} />
          </div>
        </div>

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveBalanceTransferAction} className="mt-6 grid gap-4 lg:grid-cols-3">
          <label>
            <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Medio de origen
            </span>
            <Select name="fromPaymentMethod" options={methodOptions} required />
          </label>

          <label>
            <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Medio de destino
            </span>
            <Select defaultValue="nx_local" name="toPaymentMethod" options={methodOptions} required />
          </label>

          <label>
            <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Monto
            </span>
            <Input min={0.01} name="amount" placeholder="Ej: 50000" required step="0.01" type="number" />
          </label>

          <label>
            <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Fecha
            </span>
            <Input defaultValue={today} name="transferDate" required type="date" />
          </label>

          <label className="lg:col-span-2">
            <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Descripcion / motivo opcional
            </span>
            <Input name="description" placeholder="Ej: cambio de efectivo por transferencia" />
          </label>

          <div className="rounded-[28px] border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-900 lg:col-span-3">
            Este movimiento solo reacomoda saldos internos. No modifica ventas, gastos, reparaciones, facturacion ni ganancia real.
          </div>

          <div className="flex justify-end lg:col-span-3">
            <FormSubmitButton idleLabel="Guardar cambio" pendingLabel="Guardando..." />
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="flex items-center justify-between gap-3 border-b border-graphite/8 bg-brand-50/80 px-4 py-4">
          <div>
            <p className="panel-kicker">Historial</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Cambios realizados</h2>
          </div>
          <History className="h-5 w-5 text-slate-400" />
        </div>

        <div className="grid gap-3 p-3 lg:hidden">
          {transfers.length ? (
            transfers.map((transfer) => (
              <TransferMobileCard key={transfer.id} transfer={transfer} />
            ))
          ) : (
            <div className="empty-panel">Todavia no hay cambios de balance registrados.</div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white/80 text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 font-medium">Fecha</th>
                <th className="px-4 py-4 font-medium">Origen</th>
                <th className="px-4 py-4 font-medium">Destino</th>
                <th className="px-4 py-4 font-medium text-right">Monto</th>
                <th className="px-4 py-4 font-medium">Descripcion</th>
                <th className="px-4 py-4 font-medium">Usuario</th>
                <th className="px-4 py-4 font-medium">Creado</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr className="border-t border-graphite/8 bg-white/72 align-top transition duration-200 hover:bg-white" key={transfer.id}>
                  <td className="px-4 py-4 text-slate-600">{formatDate(transfer.transferDate)}</td>
                  <td className="px-4 py-4 font-semibold text-slate-950">{formatBalanceTransferMethod(transfer.fromPaymentMethod)}</td>
                  <td className="px-4 py-4 font-semibold text-slate-950">{formatBalanceTransferMethod(transfer.toPaymentMethod)}</td>
                  <td className="px-4 py-4 text-right font-semibold text-graphite">{formatCurrency(transfer.amount)}</td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>{transfer.description || "-"}</p>
                    {transfer.isVoided ? <p className="mt-1 text-xs font-semibold text-rose-600">Anulado con movimiento inverso.</p> : null}
                    {transfer.reversalOfTransferId ? <p className="mt-1 text-xs font-semibold text-amber-700">Movimiento inverso de anulacion.</p> : null}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{transfer.createdBy?.fullName ?? "-"}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(transfer.createdAt)}</td>
                  <td className="px-4 py-4">
                    <TransferActions transfer={transfer} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!transfers.length ? (
            <div className="empty-panel border-t border-graphite/8">Todavia no hay cambios de balance registrados.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric-tile min-h-[unset] p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
          {icon}
        </span>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function TransferMobileCard({ transfer }: { transfer: BalanceTransferRecord }) {
  return (
    <article className="rounded-[24px] border border-graphite/8 bg-white/86 p-4 shadow-[0_10px_20px_rgba(20,20,19,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{formatDate(transfer.transferDate)}</p>
          <p className="mt-1 font-semibold text-slate-950">
            {formatBalanceTransferMethod(transfer.fromPaymentMethod)} a {formatBalanceTransferMethod(transfer.toPaymentMethod)}
          </p>
        </div>
        <p className="font-semibold text-graphite">{formatCurrency(transfer.amount)}</p>
      </div>
      <p className="mt-3 text-sm text-slate-600">{transfer.description || "Sin descripcion"}</p>
      {transfer.isVoided ? <p className="mt-2 text-xs font-semibold text-rose-600">Anulado con movimiento inverso.</p> : null}
      {transfer.reversalOfTransferId ? <p className="mt-2 text-xs font-semibold text-amber-700">Movimiento inverso de anulacion.</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        Usuario: {transfer.createdBy?.fullName ?? "-"} - Creado: {formatDate(transfer.createdAt)}
      </p>
      <div className="mt-4">
        <TransferActions transfer={transfer} mobile />
      </div>
    </article>
  );
}

function TransferActions({ transfer, mobile = false }: { transfer: BalanceTransferRecord; mobile?: boolean }) {
  if (transfer.isVoided || transfer.reversalOfTransferId) {
    return <span className="text-xs font-semibold text-slate-400">Sin acciones</span>;
  }

  return (
    <form
      action={voidBalanceTransferAction}
      className={mobile ? "grid gap-2" : "flex justify-end"}
      onSubmit={(event) => {
        if (!window.confirm("Anular este cambio de balance creando un movimiento inverso?")) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={transfer.id} />
      <Textarea className="hidden" name="reason" />
      <Button size="sm" type="submit" variant="danger">
        <Repeat2 className="h-4 w-4" />
        Anular
      </Button>
    </form>
  );
}
