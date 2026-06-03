"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteRepairAction, saveRepairAction } from "@/features/repairs/actions";
import { buildRepairFormFromRepair, canUsePaymentMethod, type RepairFormValues, type RepairListRecord } from "@/features/repairs/repair-form";
import { repairStatusValues } from "@/features/repairs/schemas";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate } from "@/lib/utils";

type AccessOrder = {
  id: string;
  repairNumber: string;
  customerName: string;
  customerPhone: string;
  device: string;
  issueDescription: string;
  amount: number;
  paymentMethod: string;
  warrantyDays: number;
  warrantyConditions: string;
  observations: string;
};

const emptyFormValues: RepairFormValues = {
  id: "",
  repairAccessOrderId: "",
  accessOrderNumber: "",
  customerName: "",
  customerPhone: "",
  device: "",
  issueDescription: "",
  status: "entregado",
  amount: "",
  paymentMethod: "efectivo",
  observations: ""
};

const repairStatusLabels: Record<string, string> = {
  ingresado: "Ingresado",
  en_diagnostico: "En diagnostico",
  esperando_repuestos: "Esperando repuestos",
  en_reparacion: "En reparacion",
  listo: "Listo",
  entregado: "Entregado / retirado",
  cancelado: "Cancelado"
};

export function RepairsList({
  repairs,
  message
}: {
  repairs: RepairListRecord[];
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<RepairListRecord | null>(null);
  const [formValues, setFormValues] = useState<RepairFormValues>(emptyFormValues);
  const [lookupStatus, setLookupStatus] = useState<{ loading: boolean; message: string; success: boolean }>({
    loading: false,
    message: "",
    success: false
  });
  const delivered = repairs.filter((repair) => repair.status === "entregado").length;
  const revenue = repairs.reduce((acc, repair) => acc + repair.finalPrice, 0);

  function updateField(field: keyof RepairFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditing(null);
    setLookupStatus({ loading: false, message: "", success: false });
    setFormValues(emptyFormValues);
  }

  function startEdit(repair: RepairListRecord) {
    setEditing(repair);
    setLookupStatus({ loading: false, message: "", success: false });
    setFormValues(buildRepairFormFromRepair(repair));
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
      setEditing(null);
      setFormValues((current) => ({
        ...current,
        id: "",
        repairAccessOrderId: order.id,
        accessOrderNumber: order.repairNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        device: order.device || current.device,
        issueDescription: order.issueDescription,
        status: "entregado",
        amount: order.amount > 0 ? String(order.amount) : current.amount,
        paymentMethod: canUsePaymentMethod(order.paymentMethod) ? order.paymentMethod : current.paymentMethod,
        observations: order.observations || current.observations
      }));
      setLookupStatus({
        loading: false,
        message: `Orden ${order.repairNumber} cargada. Al guardar con monto, impacta caja y la orden Access pasa a retirado.`,
        success: true
      });
    } catch {
      setLookupStatus({ loading: false, message: "No pude consultar la orden Access. Proba de nuevo.", success: false });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Facturacion real de reparaciones</p>
            <h1 className="text-3xl font-semibold text-slate-950">Registrar cobro de reparacion</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Carga una orden Access por numero para traer cliente y equipo. Solo esta pantalla mueve caja mediante repair_payments.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-brand-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-700">Entregadas listadas</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{delivered}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Ingresos listados</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(revenue)}</p>
            </div>
          </div>
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <form action={saveRepairAction} className="mt-6 grid gap-4 lg:grid-cols-6">
          <input name="id" type="hidden" value={formValues.id} />
          <input name="repairAccessOrderId" type="hidden" value={formValues.repairAccessOrderId} />

          <div className="rounded-3xl border border-brand-100 bg-brand-50/60 p-4 lg:col-span-6">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Numero de orden Access</span>
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
              <p className={`mt-3 rounded-2xl px-4 py-3 text-sm ${lookupStatus.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {lookupStatus.message}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                La ficha Access solo aporta datos. El saldo se modifica recien al guardar esta reparacion con monto y medio de pago.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Cliente</label>
            <Input name="customerName" onChange={(event) => updateField("customerName", event.target.value)} placeholder="Nombre" value={formValues.customerName} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Telefono</label>
            <Input name="customerPhone" onChange={(event) => updateField("customerPhone", event.target.value)} placeholder="WhatsApp" value={formValues.customerPhone} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Equipo</label>
            <Input name="device" onChange={(event) => updateField("device", event.target.value)} placeholder="TV, notebook..." value={formValues.device} />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Falla</label>
            <Input name="issueDescription" onChange={(event) => updateField("issueDescription", event.target.value)} placeholder="Que le pasa al equipo" value={formValues.issueDescription} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Estado</label>
            <Select
              name="status"
              onChange={(event) => updateField("status", event.target.value)}
              options={repairStatusValues.map((status) => ({ value: status, label: repairStatusLabels[status] ?? status }))}
              value={formValues.status}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Monto a facturar</label>
            <Input min={0} name="amount" onChange={(event) => updateField("amount", event.target.value)} step="0.01" type="number" value={formValues.amount} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Medio de ingreso</label>
            <Select
              name="paymentMethod"
              onChange={(event) => updateField("paymentMethod", event.target.value)}
              options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
              value={formValues.paymentMethod}
            />
          </div>
          <div className="lg:col-span-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
            <Textarea name="observations" onChange={(event) => updateField("observations", event.target.value)} placeholder="Datos de entrega, garantia o aclaraciones" value={formValues.observations} />
          </div>
          <div className="flex items-end gap-2">
            <Button className="w-full" type="submit">{editing ? "Actualizar" : "Guardar cobro"}</Button>
            {(editing || formValues.repairAccessOrderId || formValues.customerName) ? <Button onClick={resetForm} type="button" variant="secondary">Limpiar</Button> : null}
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 font-medium">Orden Access</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Precio final</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map((repair) => (
                <tr className="border-t border-slate-100" key={repair.id}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{repair.customerName}</p>
                      <p className="text-xs text-slate-500">{repair.customerPhone || repair.issueDescription}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{repair.device}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {repair.repairAccessOrderNumber ? <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{repair.repairAccessOrderNumber}</span> : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(repair.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatCurrency(repair.finalPrice || repair.estimatedPrice)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={repair.status === "entregado" ? "success" : "default"}>
                      {repairStatusLabels[repair.status] ?? repair.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => startEdit(repair)} size="sm" type="button" variant="secondary">Editar</Button>
                      <form action={deleteRepairAction}>
                        <input name="id" type="hidden" value={repair.id} />
                        <Button size="sm" type="submit" variant="danger">Eliminar</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
