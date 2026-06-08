"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod, getCashMethodOptions } from "@/lib/cash";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";
import {
  cancelInstallmentAction,
  cancelInstallmentSaleAction,
  markInstallmentPaidAction,
  saveInstallmentSaleAction,
  updateInstallmentAction
} from "@/features/installments/actions";
import { generateInstallments } from "@/features/installments/model";

function getBadgeTone(status: string) {
  if (status === "pagada" || status === "finalizada") return "bg-emerald-50 text-emerald-700";
  if (status === "vencida") return "bg-amber-50 text-amber-800";
  if (status === "cancelada") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export function InstallmentsView({
  canCancelSales,
  data,
  filters,
  message
}: {
  canCancelSales: boolean;
  data: {
    migrationReady: boolean;
    today: string;
    summary: {
      activeSales: number;
      pendingInstallments: number;
      overdueInstallments: number;
      paidInstallments: number;
    };
    sales: Array<{
      id: string;
      productName: string;
      customerName: string;
      totalAmount: number;
      installmentsCount: number;
      notes: string;
      status: string;
      displayStatus: string;
      createdAt: string;
      updatedAt: string;
      paidAmount: number;
      pendingAmount: number;
      paidCount: number;
      installments: Array<{
        id: string;
        saleId: string;
        installmentNumber: number;
        dueDate: string;
        amount: number;
        paymentMethod: string;
        status: string;
        displayStatus: string;
        paidAt: string | null;
        notes: string;
      }>;
    }>;
  };
  filters: {
    customer?: string;
    product?: string;
    status?: string;
    dueFrom?: string;
    dueTo?: string;
    paymentMethod?: string;
  };
  message: ActionResult | null;
}) {
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(getLocalDateInputValue());
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");
  const [installments, setInstallments] = useState(
    generateInstallments({
      totalAmount: 0,
      installmentsCount: 1,
      firstDueDate: getLocalDateInputValue(),
      paymentMethod: "efectivo"
    })
  );

  useEffect(() => {
    const nextTotal = totalAmount > 0 ? totalAmount : 0;
    const nextCount = installmentsCount > 0 ? installmentsCount : 1;

    setInstallments(
      generateInstallments({
        totalAmount: nextTotal,
        installmentsCount: nextCount,
        firstDueDate,
        paymentMethod: defaultPaymentMethod
      })
    );
  }, [defaultPaymentMethod, firstDueDate, installmentsCount, totalAmount]);

  function updateInstallment(
    index: number,
    field: "dueDate" | "amount" | "paymentMethod" | "notes",
    value: string
  ) {
    setInstallments((current) =>
      current.map((installment, installmentIndex) =>
        installmentIndex === index
          ? {
              ...installment,
              [field]: field === "amount" ? Number(value) : value
            }
          : installment
      )
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="panel-kicker">Ventas financiadas</p>
            <h1 className="panel-heading mt-3">Cuotas</h1>
            <p className="panel-subheading mt-3">
              Carga ventas en cuotas sin depender del inventario y registra el cobro real recien cuando cada cuota se paga.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[26rem]">
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Ventas activas</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{data.summary.activeSales}</p>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Cuotas vencidas</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-finance-caution">{data.summary.overdueInstallments}</p>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Pendientes</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{data.summary.pendingInstallments}</p>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Pagadas</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-finance-profit">{data.summary.paidInstallments}</p>
            </div>
          </div>
        </div>

        {!data.migrationReady ? (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Falta ejecutar la migracion de cuotas en Supabase para activar este modulo.
          </p>
        ) : null}

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveInstallmentSaleAction} className="mt-6 space-y-4">
          <input name="installmentsJson" type="hidden" value={JSON.stringify(installments)} />

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Producto vendido
              </label>
              <Input name="productName" onChange={(event) => setProductName(event.target.value)} placeholder="Ej: TV Samsung 43 reacondicionado" value={productName} />
            </div>
            <div className="xl:col-span-2">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Cliente
              </label>
              <Input name="customerName" onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre del cliente" value={customerName} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Monto total
              </label>
              <Input min={0} name="totalAmount" onChange={(event) => setTotalAmount(Number(event.target.value))} step="0.01" type="number" value={totalAmount > 0 ? totalAmount : ""} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Cantidad de cuotas
              </label>
              <Input min={1} name="installmentsCount" onChange={(event) => setInstallmentsCount(Number(event.target.value))} type="number" value={installmentsCount} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Primera cuota
              </label>
              <Input name="firstDueDate" onChange={(event) => setFirstDueDate(event.target.value)} type="date" value={firstDueDate} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Medio inicial
              </label>
              <Select name="defaultPaymentMethod" onChange={(event) => setDefaultPaymentMethod(event.target.value)} options={getCashMethodOptions()} value={defaultPaymentMethod} />
            </div>
            <div className="xl:col-span-4">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Observaciones
              </label>
              <Textarea name="notes" onChange={(event) => setNotes(event.target.value)} placeholder="Dato opcional para la venta en cuotas" value={notes} />
            </div>
          </div>

          <div className="rounded-[30px] border border-graphite/8 bg-white/82 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="panel-kicker">Cuotas generadas</p>
                <h2 className="mt-2 text-[1.2rem] font-semibold tracking-[-0.03em] text-slate-950">Detalle editable antes de guardar</h2>
              </div>
              <div className="rounded-[20px] border border-graphite/8 bg-brand-50 px-4 py-3 text-right">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Total cuotas</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {formatCurrency(installments.reduce((acc, installment) => acc + Number(installment.amount), 0))}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {installments.map((installment, index) => (
                <div key={installment.installmentNumber} className="grid gap-3 rounded-[24px] border border-graphite/8 bg-white/88 p-4 xl:grid-cols-[130px_160px_160px_150px_minmax(0,1fr)]">
                  <div className="rounded-[18px] border border-graphite/8 bg-brand-50 px-4 py-3 text-sm font-semibold text-slate-900">
                    Cuota {installment.installmentNumber}/{installmentsCount}
                  </div>
                  <Input onChange={(event) => updateInstallment(index, "dueDate", event.target.value)} type="date" value={installment.dueDate} />
                  <Input min={0} onChange={(event) => updateInstallment(index, "amount", event.target.value)} step="0.01" type="number" value={installment.amount} />
                  <Select onChange={(event) => updateInstallment(index, "paymentMethod", event.target.value)} options={getCashMethodOptions()} value={installment.paymentMethod} />
                  <Input onChange={(event) => updateInstallment(index, "notes", event.target.value)} placeholder="Nota opcional por cuota" value={installment.notes} />
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full sm:w-auto" disabled={!data.migrationReady} type="submit">
            Guardar venta en cuotas
          </Button>
        </form>
      </Card>

      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Filtros rapidos</p>
            <h2 className="text-xl font-semibold text-slate-950">Buscar cuotas y ventas</h2>
          </div>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Input defaultValue={filters.customer} name="customer" placeholder="Cliente" />
            <Input defaultValue={filters.product} name="product" placeholder="Producto" />
            <Select
              defaultValue={filters.status ?? ""}
              name="state"
              options={[
                { value: "", label: "Todos los estados" },
                { value: "pendiente", label: "Pendiente" },
                { value: "vencida", label: "Vencida" },
                { value: "pagada", label: "Pagada" },
                { value: "cancelada", label: "Cancelada" }
              ]}
            />
            <Input defaultValue={filters.dueFrom} name="dueFrom" type="date" />
            <Input defaultValue={filters.dueTo} name="dueTo" type="date" />
            <Select
              defaultValue={filters.paymentMethod ?? ""}
              name="paymentMethod"
              options={[
                { value: "", label: "Todos los medios" },
                ...getCashMethodOptions()
              ]}
            />
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row xl:col-span-6">
              <Button className="w-full sm:w-auto" type="submit">Aplicar filtros</Button>
              <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => (window.location.href = "/cuotas")}>
                Limpiar
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <div className="space-y-4">
        {data.sales.length ? (
          data.sales.map((sale) => (
            <Card key={sale.id} className="rounded-[34px] p-5 lg:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeTone(sale.displayStatus)}`}>
                      {sale.displayStatus}
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {sale.paidCount}/{sale.installmentsCount} cobradas
                    </span>
                  </div>
                  <h3 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">{sale.productName}</h3>
                  <p className="text-sm text-slate-600">{sale.customerName}</p>
                  {sale.notes ? <p className="text-sm text-slate-500">{sale.notes}</p> : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[28rem]">
                  <div className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Total venta</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(sale.totalAmount)}</p>
                  </div>
                  <div className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Cobrado</p>
                    <p className="mt-2 text-lg font-semibold text-finance-profit">{formatCurrency(sale.paidAmount)}</p>
                  </div>
                  <div className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Pendiente</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(sale.pendingAmount)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {sale.installments.map((installment) => (
                  <div key={installment.id} className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-950">
                            Cuota {installment.installmentNumber}/{sale.installmentsCount}
                          </span>
                          <span className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${getBadgeTone(installment.displayStatus)}`}>
                            {installment.displayStatus}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          Vence {formatDate(installment.dueDate)} - Medio {formatCashMethod(installment.paymentMethod)}
                          {installment.paidAt ? ` - Cobrada ${formatDate(installment.paidAt)}` : ""}
                        </p>
                      </div>
                      <p className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{formatCurrency(installment.amount)}</p>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px]">
                      <form action={updateInstallmentAction} className="grid gap-3 rounded-[22px] border border-graphite/8 bg-[#fbfbf8] p-4 xl:grid-cols-[140px_160px_160px_minmax(0,1fr)_auto]">
                        <input name="id" type="hidden" value={installment.id} />
                        <div className="rounded-[18px] border border-graphite/8 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                          Editar cuota
                        </div>
                        <Input defaultValue={installment.dueDate} name="dueDate" type="date" />
                        <Input defaultValue={installment.amount} min={0} name="amount" step="0.01" type="number" />
                        <Select defaultValue={installment.paymentMethod} name="paymentMethod" options={getCashMethodOptions()} />
                        <Input defaultValue={installment.notes} name="notes" placeholder="Nota de cuota" />
                        <Button className="w-full xl:w-auto" type="submit" variant="secondary">
                          Guardar cuota
                        </Button>
                      </form>

                      <div className="grid gap-3">
                        {installment.status !== "pagada" ? (
                          <form action={markInstallmentPaidAction} className="grid gap-3 rounded-[22px] border border-graphite/8 bg-brand-50/85 p-4">
                            <input name="id" type="hidden" value={installment.id} />
                            <Select defaultValue={installment.paymentMethod} name="paymentMethod" options={getCashMethodOptions()} />
                            <Input defaultValue={data.today} name="paidDate" type="date" />
                            <Button className="w-full" type="submit">Marcar pagada</Button>
                          </form>
                        ) : (
                          <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                            Cuota cobrada e impactada en caja.
                          </div>
                        )}

                        {installment.status !== "pagada" ? (
                          <form action={cancelInstallmentAction}>
                            <input name="id" type="hidden" value={installment.id} />
                            <Button className="w-full" type="submit" variant="danger">Cancelar cuota</Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {canCancelSales && sale.displayStatus !== "cancelada" ? (
                <div className="mt-5 flex justify-end">
                  <form action={cancelInstallmentSaleAction}>
                    <input name="id" type="hidden" value={sale.id} />
                    <Button className="w-full sm:w-auto" type="submit" variant="danger">Cancelar venta en cuotas</Button>
                  </form>
                </div>
              ) : null}
            </Card>
          ))
        ) : (
          <Card className="rounded-[34px] p-6">
            <div className="empty-panel">
              No hay ventas en cuotas que coincidan con los filtros actuales.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
