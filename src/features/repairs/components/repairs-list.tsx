"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, Search } from "lucide-react";

import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { deleteRepairAction, saveRepairAction } from "@/features/repairs/actions";
import type { RepairCollectionTarget } from "@/features/repairs/queries";
import { RepairPaymentsPanel } from "./repair-payments-panel";
import { formatCashMethod } from "@/lib/cash";
import type { ActionResult } from "@/lib/form-state";
import type { PaymentSplit } from "@/lib/payment-splits";
import type { PaginationMeta } from "@/lib/pagination";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

type Repair = {
  id: string;
  repairAccessOrderId: string | null;
  repairAccessOrderNumber: string;
  customerName: string;
  customerPhone: string;
  device: string;
  orderNumber: string | null;
  issueDescription: string;
  finalPrice: number;
  estimatedPrice: number;
  paymentMethod: string;
  status: string;
  observations: string | null;
  entryDate: string;
  createdAt: string;
  paidTotal: number;
  balance: number;
  financialVersion: number;
  payments: { id?: string; method: string; amount: number; paymentDate?: string; source?: string }[];
};

type AccessOrder = {
  id: string;
  repairNumber: string;
  intakeDate: string;
  customerName: string;
  customerPhone: string;
  device: string;
  issueDescription: string;
  amount: number;
  paymentMethod: string;
  observations: string;
};

type RepairFormFields = {
  id: string;
  repairAccessOrderId: string;
  accessOrderNumber: string;
  customerName: string;
  customerPhone: string;
  device: string;
  orderNumber: string;
  issueDescription: string;
};

const emptyRepairFormFields: RepairFormFields = {
  id: "",
  repairAccessOrderId: "",
  accessOrderNumber: "",
  customerName: "",
  customerPhone: "",
  device: "",
  orderNumber: "",
  issueDescription: ""
};

function fieldsFromRepair(repair: Repair): RepairFormFields {
  return { id: repair.id, repairAccessOrderId: repair.repairAccessOrderId ?? "", accessOrderNumber: repair.repairAccessOrderNumber || repair.orderNumber || "",
    customerName: repair.customerName, customerPhone: repair.customerPhone ?? "", device: repair.device,
    orderNumber: repair.orderNumber ?? repair.repairAccessOrderNumber ?? "", issueDescription: repair.issueDescription ?? "" };
}
function fieldsFromOrder(order: AccessOrder): RepairFormFields {
  return { id: "", repairAccessOrderId: order.id, accessOrderNumber: order.repairNumber, customerName: order.customerName,
    customerPhone: order.customerPhone, device: order.device, orderNumber: order.repairNumber, issueDescription: order.issueDescription };
}

export function RepairsList({
  canDelete,
  repairs,
  pagination,
  message,
  collectionTarget
}: {
  canDelete: boolean;
  repairs: Repair[];
  pagination: PaginationMeta;
  message: ActionResult | null;
  collectionTarget?: RepairCollectionTarget | null;
}) {
  const today = getLocalDateInputValue();
  const initialRepair = collectionTarget?.repair ?? null;
  const initialOrder = collectionTarget?.order ?? null;
  const [editing, setEditing] = useState<Repair | null>(initialRepair);
  const [search, setSearch] = useState("");
  const [formValues, setFormValues] = useState<RepairFormFields>(() => initialRepair ? fieldsFromRepair(initialRepair) : initialOrder ? fieldsFromOrder(initialOrder) : emptyRepairFormFields);
  const [lookupStatus, setLookupStatus] = useState<{ loading: boolean; message: string; success: boolean }>({
    loading: false,
    message: collectionTarget?.error || (initialRepair ? "Registro financiero existente seleccionado. Agrega la sena o saldo debajo; abrir esta pantalla no registra un cobro." : initialOrder ? "REP preparada sin pagos. Registra solo el dinero recibido; abrir esta pantalla no modifica caja." : ""),
    success: !collectionTarget?.error && Boolean(initialOrder || initialRepair)
  });
  const [entryDate, setEntryDate] = useState(initialRepair?.entryDate || initialOrder?.intakeDate || today);
  const [paymentDate, setPaymentDate] = useState(today);
  const [requestId, setRequestId] = useState("");
  const [amount, setAmount] = useState(initialRepair ? String(initialRepair.finalPrice || initialRepair.estimatedPrice || 0) : initialOrder ? String(initialOrder.amount) : "");
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "efectivo", amount: 0 }]);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const [focusLedger, setFocusLedger] = useState(false);
  useEffect(() => {
    if (!focusLedger || !editing) return;
    ledgerRef.current?.scrollIntoView?.({ block: "start" });
    ledgerRef.current?.focus({ preventScroll: true });
    setFocusLedger(false);
  }, [focusLedger, editing]);
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [formValues, entryDate, paymentDate, amount, payments]);
  const totalRepairs = repairs.length;
  const revenue = repairs.reduce((acc, repair) => acc + repair.paidTotal, 0);
  const filteredRepairs = repairs.filter((repair) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return [repair.customerName, repair.device, repair.orderNumber ?? ""].some((value) =>
      value.toLowerCase().includes(query)
    ) || repair.repairAccessOrderNumber.toLowerCase().includes(query);
  });

  const amountValue = Number(amount || 0);
  const currentLedger = editing ? repairs.find((repair) => repair.id === editing.id) ?? editing : null;

  function updateField(field: keyof RepairFormFields, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function startEdit(repair: Repair, showPayments = false) {
    setRequestId(crypto.randomUUID());
    setEditing(repair);
    setLookupStatus({ loading: false, message: "", success: false });
    setFormValues(fieldsFromRepair(repair));
    setEntryDate(repair.entryDate);
    setAmount(String(repair.finalPrice || repair.estimatedPrice || 0));
    setPayments([{ method: "efectivo", amount: 0 }]);
    setFocusLedger(showPayments);
  }

  function resetForm() {
    setRequestId(crypto.randomUUID());
    setEditing(null);
    setLookupStatus({ loading: false, message: "", success: false });
    setFormValues(emptyRepairFormFields);
    setEntryDate(today);
    setPaymentDate(today);
    setAmount("");
    setPayments([{ method: "efectivo", amount: 0 }]);
  }

  async function loadAccessOrder() {
    const requestedNumber = formValues.accessOrderNumber.trim();

    if (!requestedNumber) {
      setLookupStatus({ loading: false, message: "Ingresa un numero de orden REP.", success: false });
      return;
    }

    setLookupStatus({ loading: true, message: "Buscando orden REP...", success: false });

    try {
      const response = await fetch(`/api/repair-access/orders/${encodeURIComponent(requestedNumber)}`, {
        headers: { accept: "application/json" }, cache: "no-store"
      });
      const result = await response.json();

      if (!response.ok || !result.order) {
        setLookupStatus({ loading: false, message: result.error || "No encontre una REP con ese numero.", success: false });
        return;
      }

      const order = result.order as AccessOrder;
      if (result.financialRecord) {
        if (result.financialRecord.repairAccessOrderId !== order.id) throw new Error("Vinculo financiero inconsistente");
        startEdit(result.financialRecord as Repair, true);
        setLookupStatus({ loading: false, message: `Registro financiero de ${order.repairNumber} seleccionado. Agrega la sena o saldo debajo; no se crea un registro duplicado.`, success: true });
        return;
      }

      setEditing(null);
      setFormValues(fieldsFromOrder(order));
      setEntryDate(order.intakeDate || today);
      setAmount(String(order.amount));
      setPayments([{ method: "efectivo", amount: 0 }]);
      setLookupStatus({
        loading: false,
        message: `Orden ${order.repairNumber} cargada. El cobro actualiza caja, no entrega el equipo ni inicia garantia. Si ya existe un registro financiero, agrega alli la sena o saldo.`,
        success: true
      });
    } catch {
      setLookupStatus({ loading: false, message: "No se pudo consultar la REP. Proba de nuevo.", success: false });
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-slate-950">Cobros de reparaciones</h1>
            <p className="mt-2 text-sm text-slate-600">
              Selecciona la REP y registra solo el dinero recibido. Cobrar no entrega el equipo ni inicia la garantia.
            </p>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-slate-600">Registros en esta pagina</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{totalRepairs}</dd></div>
            <div><dt className="text-sm text-slate-600">Cobrado en esta pagina</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(revenue)}</dd></div>
          </dl>
        </div>

        {message ? (
          <div aria-live="polite" className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"} role={message.success ? "status" : "alert"}>
            {message.message}
          </div>
        ) : null}
      </header>
      {currentLedger ? <div ref={ledgerRef} tabIndex={-1} role="group" aria-label={`Cobros de ${currentLedger.repairAccessOrderNumber || currentLedger.orderNumber || "la reparación seleccionada"}`} className="scroll-mt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        <RepairPaymentsPanel key={`${currentLedger.id}:${currentLedger.financialVersion}`} repair={currentLedger} canReverse={canDelete} />
      </div> : null}
      <Card>
        <details open={!editing || undefined}>
          <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">{editing ? "Editar datos y precio del registro" : "Nuevo registro de cobro"}</summary>
        <form action={saveRepairAction} className="mt-4 space-y-4">
          <input name="id" type="hidden" value={formValues.id} />
          <input name="requestId" type="hidden" value={requestId} />
          <input name="expectedVersion" type="hidden" value={editing?.financialVersion ?? ""} />
          <input name="repairAccessOrderId" type="hidden" value={formValues.repairAccessOrderId} />
          <input name="customerPhone" type="hidden" value={formValues.customerPhone} />
          <input name="issueDescription" type="hidden" value={formValues.issueDescription} />
          <input name="paymentsJson" type="hidden" value={JSON.stringify(payments)} />
          <input name="amount" type="hidden" value={amount} />

          <div className="border-t border-graphite/10 pt-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Numero de orden REP
                </span>
                <Input
                  name="accessOrderNumber"
                  onChange={(event) => updateField("accessOrderNumber", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void loadAccessOrder();
                    }
                  }}
                  placeholder="REP-000001 o 1"
                  value={formValues.accessOrderNumber}
                />
              </label>
              <Button disabled={lookupStatus.loading} onClick={() => void loadAccessOrder()} type="button">
                {lookupStatus.loading ? "Buscando..." : "Cargar orden"}
              </Button>
            </div>
            {lookupStatus.message ? (
              <p aria-live="polite" className={`mt-3 rounded-xl px-3 py-2 text-sm ${lookupStatus.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} role={lookupStatus.success ? "status" : "alert"}>
                {lookupStatus.message}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                La orden de Reparaciones trae cliente, telefono, equipo y falla. El saldo se modifica recien cuando guardas el cobro en esta pantalla.
              </p>
            )}
          </div>

          <div className="grid gap-4 border-t border-graphite/10 pt-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="customerName">
                Cliente
              </label>
              <Input
                name="customerName"
                onChange={(event) => updateField("customerName", event.target.value)}
                placeholder="Nombre del cliente"
                value={formValues.customerName}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="device">
                Equipo
              </label>
              <Input
                name="device"
                onChange={(event) => updateField("device", event.target.value)}
                placeholder="Celular, notebook..."
                value={formValues.device}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="orderNumber">
                Número de orden
              </label>
              <Input
                name="orderNumber"
                onChange={(event) => updateField("orderNumber", event.target.value)}
                placeholder="Ej: REP-000001"
                value={formValues.orderNumber}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="amount">
                Precio de reparacion
              </label>
              <MoneyInput
                key={`${editing?.id}-amount`}
                id="amount"
                onValueChange={(value) => setAmount(String(value))}
                value={amountValue}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="entryDate">
                Fecha de ingreso
              </label>
              <div className="relative">
                <CalendarRange aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input className="pl-10" name="entryDate" onChange={(event) => setEntryDate(event.target.value)} type="date" value={entryDate} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {editing ? <p className="text-sm text-slate-600">Estos cambios actualizan datos y precio, no reemplazan pagos. Para cobrar o corregir, usa el historial de esta REP.</p> : <div className="space-y-3">
              <p className="text-sm text-slate-500">El precio puede quedar pendiente o cobrarse parcialmente. Registra solo el dinero recibido.</p>
              <PaymentSplitFields onChange={setPayments} payments={payments} title="Seña o cobro inicial" totalAmount={amountValue} syncAmountWithTotal={false} />
              <label className="block text-sm">Fecha de cobro<Input className="mt-2 max-w-xs" name="paymentDate" onChange={(event) => setPaymentDate(event.target.value)} type="date" value={paymentDate} /></label>
            </div>}
            <div className="flex flex-wrap items-end justify-end gap-2">
              <FormSubmitButton
                disabled={!requestId}
                className="w-full"
                idleLabel={editing ? "Actualizar datos" : "Guardar registro y cobro"}
                pendingLabel={editing ? "Actualizando..." : "Guardando..."}
              />
              {editing || formValues.repairAccessOrderId || formValues.customerName ? (
                <Button onClick={resetForm} type="button" variant="secondary">
                  Limpiar
                </Button>
              ) : null}
            </div>
          </div>
        </form>
        </details>
      </Card>

      <div className="table-shell">
        <div className="border-b border-graphite/10 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-md">
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="repair-search">
                Buscar cobros de reparacion
              </label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input id="repair-search" onChange={(event) => setSearch(event.target.value)} placeholder="Número de orden, cliente o equipo..." value={search} className="pl-10" />
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Busca entre los {totalRepairs} registros de esta pagina. Hay {pagination.total} en el historial.
            </p>
          </div>
        </div>
        <div className="divide-y divide-graphite/10 px-4 lg:hidden">
          {filteredRepairs.map((repair) => (
            <article className="py-4" key={repair.id}>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{repair.customerName}</p>
                  <p className="mt-1 text-sm text-slate-500">{repair.customerPhone || repair.issueDescription || "-"}</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-slate-950">
                  {formatCurrency(repair.finalPrice || repair.estimatedPrice)}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="min-w-0">
                  <p className="text-sm text-slate-600">Orden</p>
                  <p className="mt-1 break-words font-semibold text-slate-800">{repair.repairAccessOrderNumber || repair.orderNumber || "-"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-600">Ingreso</p>
                  <p className="mt-1 font-semibold text-slate-800">{formatDate(repair.entryDate)}</p>
                </div>
              </div>
              <p className="mt-3 break-words text-sm leading-6 text-slate-600">{repair.device}</p>
              <p className="mt-2 text-sm">Pagado {formatCurrency(repair.paidTotal)} / Saldo {formatCurrency(repair.balance)}</p>
              {repair.payments.length ? (
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  {repair.payments.map((payment) => `${formatCashMethod(payment.method)} ${formatCurrency(payment.amount)}`).join(" + ")}
                </p>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={() => startEdit(repair, true)} type="button" variant="secondary">
                  Gestionar cobros
                </Button>
                {canDelete ? <ActionMenu label="Más acciones">
                {repair.paidTotal > 0 ? <Button className="w-full" onClick={() => startEdit(repair, true)} type="button" variant="danger">Eliminar pago</Button> : (
                  <form
                    action={deleteRepairAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Eliminar el registro sin cobros de ${repair.customerName}?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input name="id" type="hidden" value={repair.id} />
                    <Button className="w-full" type="submit" variant="danger">
                      Eliminar
                    </Button>
                  </form>
                )}
                </ActionMenu> : null}
              </div>
            </article>
          ))}
          {!filteredRepairs.length ? <div className="py-6 text-sm text-slate-500">No encontre cobros de reparaciones con esa busqueda.</div> : null}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 font-medium">Orden</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Precio final</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.map((repair) => (
                <tr className="border-t border-graphite/10 align-top" key={repair.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{repair.customerName}</p>
                    <p className="text-sm text-slate-500">{repair.customerPhone || repair.issueDescription || "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{repair.device}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">
                    {repair.repairAccessOrderNumber || repair.orderNumber || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(repair.entryDate)}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {formatCurrency(repair.finalPrice || repair.estimatedPrice)}
                    <p className="mt-1 text-sm font-normal text-slate-600">Pagado {formatCurrency(repair.paidTotal)} / Saldo {formatCurrency(repair.balance)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button onClick={() => startEdit(repair, true)} size="sm" type="button" variant="secondary">
                        Gestionar cobros
                      </Button>
                      {canDelete ? <ActionMenu label="Más acciones">
                      {repair.paidTotal > 0 ? <Button size="sm" onClick={() => startEdit(repair, true)} type="button" variant="danger">Eliminar pago</Button> : (
                        <form
                          action={deleteRepairAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Eliminar el registro sin cobros de ${repair.customerName}?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={repair.id} />
                          <Button size="sm" type="submit" variant="danger">
                            Eliminar
                          </Button>
                        </form>
                      )}
                      </ActionMenu> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRepairs.length ? (
            <div className="empty-panel border-t border-graphite/8">
              No encontre pagos de reparaciones con esa busqueda.
            </div>
          ) : null}
        </div>
        <PaginationNav meta={pagination} pathname="/reparaciones" />
      </div>
    </div>
  );
}
