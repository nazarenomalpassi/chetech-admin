"use client";

import { useState } from "react";
import { CalendarRange, Search, ShieldCheck, Wrench } from "lucide-react";

import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { deleteRepairAction, saveRepairAction } from "@/features/repairs/actions";
import { canUsePaymentMethod } from "@/features/repairs/repair-form";
import type { ActionResult } from "@/lib/form-state";
import type { PaymentSplit } from "@/lib/payment-splits";
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
  createdAt: string;
  payments: { method: string; amount: number }[];
};

type AccessOrder = {
  id: string;
  repairNumber: string;
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
  const [formValues, setFormValues] = useState<RepairFormFields>(emptyRepairFormFields);
  const [lookupStatus, setLookupStatus] = useState<{ loading: boolean; message: string; success: boolean }>({
    loading: false,
    message: "",
    success: false
  });
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
    ) || repair.repairAccessOrderNumber.toLowerCase().includes(query);
  });

  const amountValue = Number(amount || 0);

  function updateField(field: keyof RepairFormFields, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function startEdit(repair: Repair) {
    setEditing(repair);
    setLookupStatus({ loading: false, message: "", success: false });
    setFormValues({
      id: repair.id,
      repairAccessOrderId: repair.repairAccessOrderId ?? "",
      accessOrderNumber: repair.repairAccessOrderNumber || repair.orderNumber || "",
      customerName: repair.customerName,
      customerPhone: repair.customerPhone ?? "",
      device: repair.device,
      orderNumber: repair.orderNumber ?? repair.repairAccessOrderNumber ?? "",
      issueDescription: repair.issueDescription ?? ""
    });
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
    setLookupStatus({ loading: false, message: "", success: false });
    setFormValues(emptyRepairFormFields);
    setEntryDate(today);
    setAmount("");
    setPayments([{ method: "efectivo", amount: 0 }]);
  }

  async function loadAccessOrder() {
    const requestedNumber = formValues.accessOrderNumber.trim();

    if (!requestedNumber) {
      setLookupStatus({ loading: false, message: "Ingresa un numero de orden Access.", success: false });
      return;
    }

    setLookupStatus({ loading: true, message: "Buscando orden Access...", success: false });

    try {
      const response = await fetch(`/api/repair-access/orders/${encodeURIComponent(requestedNumber)}`, {
        headers: { accept: "application/json" }
      });
      const result = await response.json();

      if (!response.ok || !result.order) {
        setLookupStatus({ loading: false, message: "No encontre una orden Access con ese numero.", success: false });
        return;
      }

      const order = result.order as AccessOrder;
      const paymentMethod = canUsePaymentMethod(order.paymentMethod) ? order.paymentMethod : "efectivo";

      setEditing(null);
      setFormValues({
        id: "",
        repairAccessOrderId: order.id,
        accessOrderNumber: order.repairNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        device: order.device,
        orderNumber: order.repairNumber,
        issueDescription: order.issueDescription
      });
      if (order.amount > 0) {
        setAmount(String(order.amount));
        setPayments([{ method: paymentMethod, amount: order.amount }]);
      }
      setLookupStatus({
        loading: false,
        message: `Orden ${order.repairNumber} cargada. Al guardar el cobro aca, impacta caja y la ficha Access pasa a retirado.`,
        success: true
      });
    } catch {
      setLookupStatus({ loading: false, message: "No pude consultar la orden Access. Proba de nuevo.", success: false });
    }
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
          <input name="id" type="hidden" value={formValues.id} />
          <input name="repairAccessOrderId" type="hidden" value={formValues.repairAccessOrderId} />
          <input name="customerPhone" type="hidden" value={formValues.customerPhone} />
          <input name="issueDescription" type="hidden" value={formValues.issueDescription} />
          <input name="paymentsJson" type="hidden" value={JSON.stringify(payments)} />

          <div className="rounded-[30px] border border-brand-100 bg-brand-50/70 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Cargar desde Reparaciones Access
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
              <p className={`mt-3 rounded-[22px] px-4 py-3 text-sm ${lookupStatus.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {lookupStatus.message}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                La orden Access trae cliente, telefono, equipo y falla. El saldo se modifica recien cuando guardas el cobro en esta pantalla.
              </p>
            )}
          </div>

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-5">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
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
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
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
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Numero de orden
              </label>
              <Input
                name="orderNumber"
                onChange={(event) => updateField("orderNumber", event.target.value)}
                placeholder="Ej: REP-000001"
                value={formValues.orderNumber}
              />
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
              {editing || formValues.repairAccessOrderId || formValues.customerName ? (
                <Button onClick={resetForm} type="button" variant="secondary">
                  Limpiar
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
                <th className="px-4 py-4 font-medium">Orden</th>
                <th className="px-4 py-4 font-medium">Ingreso</th>
                <th className="px-4 py-4 font-medium">Precio final</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.map((repair) => (
                <tr className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white" key={repair.id}>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-950">{repair.customerName}</p>
                    <p className="text-xs text-slate-500">{repair.customerPhone || repair.issueDescription || "-"}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{repair.device}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">
                    {repair.repairAccessOrderNumber || repair.orderNumber || "-"}
                  </td>
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
