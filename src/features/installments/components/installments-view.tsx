"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
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
        financialVersion: number;
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
  const [requestId, setRequestId] = useState("");
  const [installments, setInstallments] = useState(
    generateInstallments({
      totalAmount: 0,
      installmentsCount: 1,
      firstDueDate: getLocalDateInputValue(),
      paymentMethod: "efectivo"
    })
  );
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [productName, customerName, totalAmount, installmentsCount, notes, installments]);

  useEffect(() => {
    const nextTotal = totalAmount > 0 ? totalAmount : 0;
    const nextCount = installmentsCount > 0 ? installmentsCount : 1;

    if (!firstDueDate) { setInstallments([]); return; }
    try { setInstallments(
      generateInstallments({
        totalAmount: nextTotal,
        installmentsCount: nextCount,
        firstDueDate,
        paymentMethod: defaultPaymentMethod
      })
    ); } catch { setInstallments([]); }
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
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-slate-950">Cuotas</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ventas financiadas. Cada cobro se registra en caja al pagar la cuota.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:max-w-lg xl:grid-cols-4">
            <div className="min-w-0 border-l border-slate-200 px-3 py-2">
              <p className="text-sm font-semibold text-slate-500">Ventas activas</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.summary.activeSales}</p>
            </div>
            <div className="min-w-0 border-l border-slate-200 px-3 py-2">
              <p className="text-sm font-semibold text-slate-500">Cuotas vencidas</p>
              <p className="mt-2 text-2xl font-semibold text-finance-caution">{data.summary.overdueInstallments}</p>
            </div>
            <div className="min-w-0 border-l border-slate-200 px-3 py-2">
              <p className="text-sm font-semibold text-slate-500">Pendientes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.summary.pendingInstallments}</p>
            </div>
            <div className="min-w-0 border-l border-slate-200 px-3 py-2">
              <p className="text-sm font-semibold text-slate-500">Pagadas</p>
              <p className="mt-2 text-2xl font-semibold text-finance-profit">{data.summary.paidInstallments}</p>
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

        <details className="mt-4 border-t border-slate-200">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">Nueva venta en cuotas</summary>
        <form action={saveInstallmentSaleAction} className="mt-3 space-y-4">
          <input name="requestId" type="hidden" value={requestId} />
          <input name="installmentsJson" type="hidden" value={JSON.stringify(installments)} />
          <input name="totalAmount" type="hidden" value={totalAmount} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Producto vendido
              </label>
              <Input aria-label="Producto vendido en cuotas" name="productName" onChange={(event) => setProductName(event.target.value)} placeholder="Ej: TV Samsung 43 reacondicionado" value={productName} />
            </div>
            <div className="xl:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Cliente
              </label>
              <Input aria-label="Cliente de la venta en cuotas" name="customerName" onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre del cliente" value={customerName} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Monto total
              </label>
              <MoneyInput aria-label="Monto total" min={0} onValueChange={setTotalAmount} value={totalAmount} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Cantidad de cuotas
              </label>
              <Input aria-label="Cantidad de cuotas" min={1} name="installmentsCount" onChange={(event) => setInstallmentsCount(Number(event.target.value))} type="number" value={installmentsCount} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Primera cuota
              </label>
              <Input aria-label="Fecha de primera cuota" name="firstDueDate" onChange={(event) => setFirstDueDate(event.target.value)} type="date" value={firstDueDate} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Medio inicial
              </label>
              <Select aria-label="Medio inicial" name="defaultPaymentMethod" onChange={(event) => setDefaultPaymentMethod(event.target.value)} options={getCashMethodOptions()} value={defaultPaymentMethod} />
            </div>
            <div className="xl:col-span-4">
              <label className="mb-2 block text-sm font-semibold text-slate-500">
                Observaciones
              </label>
              <Textarea aria-label="Observaciones de la venta en cuotas" name="notes" onChange={(event) => setNotes(event.target.value)} placeholder="Dato opcional para la venta en cuotas" value={notes} />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Detalle editable antes de guardar</h2>
              </div>
              <div className="min-w-0 border-l border-slate-200 pl-4">
                <p className="text-sm font-semibold text-slate-500">Total cuotas</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {formatCurrency(installments.reduce((acc, installment) => acc + Number(installment.amount), 0))}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {installments.map((installment, index) => (
                <div key={installment.installmentNumber} className="grid gap-3 border-t border-slate-200 py-3 sm:grid-cols-2 xl:grid-cols-[130px_minmax(0,160px)_minmax(0,160px)_minmax(0,150px)_minmax(0,1fr)]">
                  <div className="flex items-center py-3 text-sm font-semibold text-slate-900">
                    Cuota {installment.installmentNumber}/{installmentsCount}
                  </div>
                  <Input aria-label={`Vencimiento de cuota ${index + 1}`} onChange={(event) => updateInstallment(index, "dueDate", event.target.value)} type="date" value={installment.dueDate} />
                  <MoneyInput aria-label={`Monto de cuota ${index + 1}`} min={0} onValueChange={(value) => updateInstallment(index, "amount", String(value))} value={installment.amount} />
                  <Select aria-label={`Medio de pago de cuota ${index + 1}`} onChange={(event) => updateInstallment(index, "paymentMethod", event.target.value)} options={getCashMethodOptions()} value={installment.paymentMethod} />
                  <Input aria-label={`Observaciones de cuota ${index + 1}`} onChange={(event) => updateInstallment(index, "notes", event.target.value)} placeholder="Nota opcional por cuota" value={installment.notes} />
                </div>
              ))}
            </div>
          </div>

          <FormSubmitButton className="w-full sm:w-auto" disabled={!data.migrationReady || !requestId} idleLabel="Guardar venta en cuotas" pendingLabel="Guardando..." />
        </form>
        </details>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Consultar cuotas</h2>
          </div>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Input aria-label="Filtrar cuotas por cliente" defaultValue={filters.customer} name="customer" placeholder="Cliente" />
            <Input aria-label="Filtrar cuotas por producto" defaultValue={filters.product} name="product" placeholder="Producto" />
            <Select
              aria-label="Filtrar cuotas por estado"
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
            <Input aria-label="Vencimiento desde" defaultValue={filters.dueFrom} name="dueFrom" type="date" />
            <Input aria-label="Vencimiento hasta" defaultValue={filters.dueTo} name="dueTo" type="date" />
            <Select
              aria-label="Filtrar cuotas por medio de pago"
              defaultValue={filters.paymentMethod ?? ""}
              name="paymentMethod"
              options={[
                { value: "", label: "Todos los medios" },
                ...getCashMethodOptions()
              ]}
            />
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row xl:col-span-3">
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
            <Card key={sale.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeTone(sale.displayStatus)}`}>
                      {sale.displayStatus}
                    </span>
                    <span className="text-xs text-slate-500">
                      {sale.paidCount}/{sale.installmentsCount} cobradas
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">{sale.productName}</h3>
                  <p className="text-sm text-slate-600">{sale.customerName}</p>
                  {sale.notes ? <p className="text-sm text-slate-500">{sale.notes}</p> : null}
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:max-w-xl">
                  <div className="min-w-0 border-l border-slate-200 pl-3 py-2">
                    <p className="text-sm font-semibold text-slate-500">Total venta</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(sale.totalAmount)}</p>
                  </div>
                  <div className="min-w-0 border-l border-slate-200 pl-3 py-2">
                    <p className="text-sm font-semibold text-slate-500">Cobrado</p>
                    <p className="mt-2 text-lg font-semibold text-finance-profit">{formatCurrency(sale.paidAmount)}</p>
                  </div>
                  <div className="min-w-0 border-l border-slate-200 pl-3 py-2">
                    <p className="text-sm font-semibold text-slate-500">Pendiente</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(sale.pendingAmount)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {sale.installments.map((installment) => (
                  <div key={installment.id} className="border-t border-slate-200 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-950">
                            Cuota {installment.installmentNumber}/{sale.installmentsCount}
                          </span>
                          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getBadgeTone(installment.displayStatus)}`}>
                            {installment.displayStatus}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          Vence {formatDate(installment.dueDate)} - Medio {formatCashMethod(installment.paymentMethod)}
                          {installment.paidAt ? ` - Cobrada ${formatDate(installment.paidAt)}` : ""}
                        </p>
                      </div>
                      <p className="text-xl font-semibold text-slate-950">{formatCurrency(installment.amount)}</p>
                    </div>

                    <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                      {installment.status !== "pagada" && installment.status !== "cancelada" && sale.status !== "cancelada" ? <details className="self-start border-t border-slate-200">
                        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">Editar cuota</summary>
                        <form key={`${installment.id}:${installment.financialVersion}`} action={updateInstallmentAction} className="grid gap-3 pb-4 sm:grid-cols-2">
                        <input name="id" type="hidden" value={installment.id} />
                        <input name="expectedVersion" type="hidden" value={installment.financialVersion} />
                        <Input aria-label={`Vencimiento de cuota ${installment.installmentNumber}`} id={`installment-${installment.id}-due`} defaultValue={installment.dueDate} name="dueDate" type="date" />
                        <Input aria-label={`Monto de cuota ${installment.installmentNumber}`} id={`installment-${installment.id}-amount`} defaultValue={installment.amount} min={0} name="amount" step="0.01" type="number" />
                        <Select aria-label={`Medio de pago de cuota ${installment.installmentNumber}`} id={`installment-${installment.id}-method`} defaultValue={installment.paymentMethod} name="paymentMethod" options={getCashMethodOptions()} />
                        <Input aria-label={`Observaciones de cuota ${installment.installmentNumber}`} id={`installment-${installment.id}-notes`} defaultValue={installment.notes} name="notes" placeholder="Nota de cuota" />
                        <FormSubmitButton className="w-full xl:w-auto" idleLabel="Guardar cuota" pendingLabel="Guardando..." variant="secondary" />
                      </form></details> : <p className="py-3 text-sm text-slate-600">Cuota cobrada o cancelada: su importe no se edita retroactivamente.</p>}

                      <div className="grid gap-3">
                        {installment.status !== "pagada" && installment.status !== "cancelada" && sale.status !== "cancelada" ? (
                          <form action={markInstallmentPaidAction} className="grid gap-3 border-t border-slate-200 pt-3">
                            <input name="id" type="hidden" value={installment.id} />
                            <Select aria-label="Cuenta de cobro de la cuota" id={`installment-${installment.id}-paid-method`} defaultValue={installment.paymentMethod} name="paymentMethod" options={getCashMethodOptions()} />
                            <Input aria-label="Fecha de cobro de la cuota" id={`installment-${installment.id}-paid-date`} defaultValue={data.today} name="paidDate" type="date" />
                            <FormSubmitButton className="w-full" idleLabel="Marcar pagada" pendingLabel="Registrando..." />
                          </form>
                        ) : (
                          <div className="py-3 text-sm text-slate-600">
                            {installment.status === "pagada" ? "Cuota cobrada e impactada en caja." : "No se puede cobrar una cuota cancelada."}
                          </div>
                        )}

                        {installment.status !== "pagada" && installment.status !== "cancelada" && sale.status !== "cancelada" ? (
                          <form action={cancelInstallmentAction}>
                            <input name="id" type="hidden" value={installment.id} />
                            <input name="expectedVersion" type="hidden" value={installment.financialVersion} />
                            <FormSubmitButton className="w-full" idleLabel="Cancelar cuota" pendingLabel="Cancelando..." variant="danger" />
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
                    <FormSubmitButton className="w-full sm:w-auto" idleLabel="Cancelar venta en cuotas" pendingLabel="Cancelando..." variant="danger" />
                  </form>
                </div>
              ) : null}
            </Card>
          ))
        ) : (
          <Card className="p-6">
            <div className="empty-panel">
              No hay ventas en cuotas que coincidan con los filtros actuales.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
