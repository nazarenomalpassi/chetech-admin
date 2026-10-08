"use client";

import { ArrowRightLeft, Ban, History, Repeat2, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
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
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-slate-950">Transferencias entre cuentas</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Mueve dinero entre Efectivo, NX SANTI y NX LOCAL sin alterar ventas, gastos ni ganancias.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:max-w-xl">
            <MetricCard icon={<ArrowRightLeft className="h-4 w-4" />} label="Transferencias activas" value={summary.activeCount.toString()} />
            <MetricCard icon={<WalletCards className="h-4 w-4" />} label="Monto transferido" value={formatCurrency(summary.totalActive)} />
            <MetricCard icon={<Ban className="h-4 w-4" />} label="Monto anulado" value={formatCurrency(summary.totalVoided)} />
          </div>
        </div>

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveBalanceTransferAction} className="mt-6 grid gap-4 lg:grid-cols-3">
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-500">
              Cuenta de origen
            </span>
            <Select name="fromPaymentMethod" options={methodOptions} required />
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-500">
              Cuenta de destino
            </span>
            <Select defaultValue="nx_local" name="toPaymentMethod" options={methodOptions} required />
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-500">
              Monto
            </span>
            <Input min={0.01} name="amount" placeholder="Ej: 50000" required step="0.01" type="number" />
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-500">
              Fecha
            </span>
            <Input defaultValue={today} name="transferDate" required type="date" />
          </label>

          <label className="lg:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-500">
              Motivo (opcional)
            </span>
            <Input name="description" placeholder="Ej: cambio de efectivo por transferencia" />
          </label>

          <div className="text-sm leading-6 text-slate-600 lg:col-span-3">
            La transferencia no cambia el saldo total ni la ganancia.
          </div>

          <div className="flex justify-end lg:col-span-3">
            <FormSubmitButton idleLabel="Guardar transferencia" pendingLabel="Guardando..." />
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="flex items-center justify-between gap-3 border-b border-graphite/8 bg-brand-50/80 px-4 py-3">
          <div>
            <h2 className="mt-1 text-xl font-semibold tabular-nums text-slate-950">Transferencias realizadas</h2>
          </div>
          <History className="h-5 w-5 text-slate-400" />
        </div>

        <div className="grid divide-y divide-slate-200 px-4 lg:hidden">
          {transfers.length ? (
            transfers.map((transfer) => (
              <TransferMobileCard key={transfer.id} transfer={transfer} />
            ))
          ) : (
            <div className="empty-panel">Todavia no hay transferencias entre cuentas registradas.</div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
                <th className="px-4 py-3 font-medium">Descripcion</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Creado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr className="border-t border-graphite/8 bg-white align-top hover:bg-slate-50" key={transfer.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDate(transfer.transferDate)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{formatBalanceTransferMethod(transfer.fromPaymentMethod)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{formatBalanceTransferMethod(transfer.toPaymentMethod)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-graphite">{formatCurrency(transfer.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{transfer.description || "-"}</p>
                    {transfer.isVoided ? <p className="mt-1 text-xs font-semibold text-rose-600">Anulado con movimiento inverso.</p> : null}
                    {transfer.reversalOfTransferId ? <p className="mt-1 text-xs font-semibold text-amber-700">Movimiento inverso de anulacion.</p> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{transfer.createdBy?.fullName ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(transfer.createdAt)}</td>
                  <td className="px-4 py-3">
                    <TransferActions transfer={transfer} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!transfers.length ? (
            <div className="empty-panel border-t border-graphite/8">Todavia no hay transferencias entre cuentas registradas.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-slate-200 px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="inline-flex shrink-0 items-center justify-center text-slate-500">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function TransferMobileCard({ transfer }: { transfer: BalanceTransferRecord }) {
  return (
    <article className="border-b border-slate-200 py-4">
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
    <ActionMenu label="Más acciones">
    <form
      action={voidBalanceTransferAction}
      className={mobile ? "grid gap-2" : "flex justify-end"}
      onSubmit={(event) => {
        if (!window.confirm("Anular esta transferencia entre cuentas creando un movimiento inverso?")) {
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
    </ActionMenu>
  );
}
