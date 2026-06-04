"use client";

import { useState } from "react";
import { CalendarRange, Search, ShieldCheck, Wrench } from "lucide-react";

import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { deleteRepairAction, saveRepairAction } from "@/features/repairs/actions";
import type { ActionResult } from "@/lib/form-state";
import type { PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

type Repair = {
  id: string;
  customerName: string;
  device: string;
  orderNumber: string | null;
  finalPrice: number;
  estimatedPrice: number;
  status: string;
  createdAt: string;
  payments: { method: string; amount: number }[];
};

export function RepairsList({
  canDelete,
  repairs,
  message
}: {
  canDelete: boolean;
  repairs: Repair[];
  message: ActionResult | null;
}) {
  const today = getLocalDateInputValue();
  const [editing, setEditing] = useState<Repair | null>(null);
  const [search, setSearch] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "efectivo", amount: 0 }]);
  const totalRepairs = repairs.length;
  const revenue = repairs.reduce((acc, repair) => acc + repair.finalPrice, 0);
  const filteredRepairs = repairs.filter((repair) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return [repair.customerName, repair.device, repair.orderNumber ?? ""].some((value) =>
      value.toLowerCase().includes(query)
    );
  });

  const amountValue = Number(amount || 0);

  function startEdit(repair: Repair) {
    setEditing(repair);
    setEntryDate(repair.createdAt.slice(0, 10));
    setAmount(String(repair.finalPrice || repair.estimatedPrice || 0));
    setPayments(
      repair.payments.length
        ? repair.payments.map((payment) => ({ method: payment.method, amount: payment.amount }))
        : [{ method: "efectivo", amount: repair.finalPrice || repair.estimatedPrice || 0 }]
    );
  }

  function resetForm() {
    setEditing(null);
    setEntryDate(today);
    setAmount("");
    setPayments([{ method: "efectivo", amount: 0 }]);
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="panel-kicker">Servicio tecnico</p>
            <h1 className="panel-heading mt-3">Nueva reparacion rapida</h1>
            <p className="panel-subheading mt-3">
              Registra cliente, equipo, numero de orden, fecha y cobro con una vista mas limpia para el taller.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[23rem]">
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Reparaciones listadas
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{totalRepairs}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-finance-profitSoft text-finance-profit">
                  <Wrench className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Ingresos listados
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{formatCurrency(revenue)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveRepairAction} className="mt-6 space-y-4">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <input name="paymentsJson" type="hidden" value={JSON.stringify(payments)} />

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-5">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Cliente
              </label>
              <Input defaultValue={editing?.customerName ?? ""} key={`${editing?.id}-customer`} name="customerName" placeholder="Nombre del cliente" />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Equipo
              </label>
              <Input defaultValue={editing?.device ?? ""} key={`${editing?.id}-device`} name="device" placeholder="Celular, notebook..." />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Numero de orden
              </label>
              <Input defaultValue={editing?.orderNumber ?? ""} key={`${editing?.id}-order`} name="orderNumber" placeholder="Ej: 12345" />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Monto
              </label>
              <Input
                key={`${editing?.id}-amount`}
                min={0}
                name="amount"
                onChange={(event) => setAmount(event.target.value)}
                step="0.01"
                type="number"
                value={amount}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Fecha de ingreso
              </label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-10" name="entryDate" onChange={(event) => setEntryDate(event.target.value)} type="date" value={entryDate} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <PaymentSplitFields onChange={setPayments} payments={payments} title="Cobro de la reparacion" totalAmount={amountValue} />
            <div className="flex items-end gap-2">
              <FormSubmitButton
                className="w-full"
                idleLabel={editing ? "Actualizar reparacion" : "Guardar reparacion"}
                pendingLabel={editing ? "Actualizando..." : "Guardando..."}
              />
              {editing ? (
                <Button onClick={resetForm} type="button" variant="secondary">
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-md">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Buscar reparacion
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input onChange={(event) => setSearch(event.target.value)} placeholder="Numero de orden, cliente o equipo..." value={search} className="pl-10" />
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Mostrando las ultimas 100 reparaciones para sostener buena velocidad en mostrador.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/80 text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Equipo</th>
                <th className="px-4 py-4 font-medium">Numero de orden</th>
                <th className="px-4 py-4 font-medium">Ingreso</th>
                <th className="px-4 py-4 font-medium">Precio final</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.map((repair) => (
                <tr className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white" key={repair.id}>
                  <td className="px-4 py-4 font-medium text-slate-950">{repair.customerName}</td>
                  <td className="px-4 py-4 text-slate-600">{repair.device}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">{repair.orderNumber || "-"}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(repair.createdAt)}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">
                    {formatCurrency(repair.finalPrice || repair.estimatedPrice)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => startEdit(repair)} size="sm" type="button" variant="secondary">
                        Editar
                      </Button>
                      {canDelete ? (
                        <form
                          action={deleteRepairAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Eliminar la reparacion de ${repair.customerName}?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={repair.id} />
                          <Button size="sm" type="submit" variant="danger">
                            Eliminar
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRepairs.length ? (
            <div className="empty-panel border-t border-graphite/8">
              No encontre reparaciones con esa busqueda.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
