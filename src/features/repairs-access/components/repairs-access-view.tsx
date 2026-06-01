"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteRepairAccessOrderAction, saveRepairAccessOrderAction } from "@/features/repairs-access/actions";
import { repairAccessStatusValues } from "@/features/repairs-access/schemas";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairsAccessView({
  orders,
  customers,
  latestImport,
  summary,
  message
}: {
  orders: RepairAccessOrderRecord[];
  customers: {
    id: string;
    fullName: string;
    phone: string;
    alternatePhone: string;
    dni: string;
    email: string;
    address: string;
    source: string;
    createdAt: string;
  }[];
  latestImport: {
    id: string;
    fileName: string;
    totalRows: number;
    importedCount: number;
    updatedCount: number;
    duplicateCount: number;
    errorCount: number;
    createdAt: string;
  } | null;
  summary: {
    totalOrders: number;
    totalCustomers: number;
    activeOrders: number;
    paidOrders: number;
    pendingBudget: number;
    totalProjected: number;
  };
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<RepairAccessOrderRecord | null>(null);

  const statusOptions = useMemo(
    () => repairAccessStatusValues.map((status) => ({ value: status, label: status.replaceAll("_", " ") })),
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Migracion paralela desde Access</p>
            <h1 className="text-3xl font-semibold text-slate-950">Reparaciones Access</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Este modulo trabaja sobre tablas nuevas para clientes, equipos y ordenes, sin mezclar el flujo actual de reparaciones.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-brand-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-700">Ordenes</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{summary.totalOrders}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Clientes</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{summary.totalCustomers}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Activas</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{summary.activeOrders}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Cobradas</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{summary.paidOrders}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Proyectado</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(summary.totalProjected)}</p>
            </div>
          </div>
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <form action={saveRepairAccessOrderAction} className="mt-6 grid gap-4 lg:grid-cols-6">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <input name="customerId" type="hidden" value={editing?.customer.id ?? ""} />
          <input name="deviceId" type="hidden" value={editing?.device.id ?? ""} />

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Cliente</label>
            <Input defaultValue={editing?.customer.fullName ?? ""} key={`${editing?.id}-customer-name`} name="customerName" placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Telefono</label>
            <Input defaultValue={editing?.customer.phone ?? ""} key={`${editing?.id}-customer-phone`} name="customerPhone" placeholder="WhatsApp" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Tel. alternativo</label>
            <Input defaultValue={editing?.customer.alternatePhone ?? ""} key={`${editing?.id}-customer-alt-phone`} name="customerAlternatePhone" placeholder="Opcional" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">DNI</label>
            <Input defaultValue={editing?.customer.dni ?? ""} key={`${editing?.id}-customer-dni`} name="customerDni" placeholder="Opcional" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <Input defaultValue={editing?.customer.email ?? ""} key={`${editing?.id}-customer-email`} name="customerEmail" placeholder="Opcional" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Equipo</label>
            <Input defaultValue={editing?.device.deviceType ?? ""} key={`${editing?.id}-device-type`} name="deviceType" placeholder="TV, notebook..." />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Modelo</label>
            <Input defaultValue={editing?.device.model ?? ""} key={`${editing?.id}-device-model`} name="deviceModel" placeholder="Modelo" />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Falla declarada</label>
            <Input defaultValue={editing?.issueReported ?? ""} key={`${editing?.id}-issue`} name="issueReported" placeholder="Detalle del ingreso" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Diagnostico tecnico</label>
            <Input defaultValue={editing?.technicalDiagnosis ?? ""} key={`${editing?.id}-diagnosis`} name="technicalDiagnosis" placeholder="Opcional por ahora" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Fecha ingreso</label>
            <Input defaultValue={editing?.intakeDate ?? new Date().toISOString().slice(0, 10)} key={`${editing?.id}-intake`} name="intakeDate" type="date" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Estado</label>
            <Select
              defaultValue={editing?.status ?? "ingresado"}
              key={`${editing?.id}-status`}
              name="status"
              options={statusOptions}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Presupuesto</label>
            <Input defaultValue={editing?.budgetAmount ?? 0} key={`${editing?.id}-budget`} min={0} name="budgetAmount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Aprobado</label>
            <Input defaultValue={editing?.approvedAmount ?? 0} key={`${editing?.id}-approved`} min={0} name="approvedAmount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Final</label>
            <Input defaultValue={editing?.finalAmount ?? 0} key={`${editing?.id}-final`} min={0} name="finalAmount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Medio de pago</label>
            <Select
              defaultValue={editing?.paymentMethod ?? "efectivo"}
              key={`${editing?.id}-payment-method`}
              name="paymentMethod"
              options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Prioridad</label>
            <Input defaultValue={editing?.priority ?? ""} key={`${editing?.id}-priority`} name="priority" placeholder="Normal, urgente..." />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Garantia dias</label>
            <Input defaultValue={editing?.warrantyDays ?? 0} key={`${editing?.id}-warranty-days`} min={0} name="warrantyDays" type="number" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input defaultChecked={editing?.isPaid ?? false} key={`${editing?.id}-is-paid`} name="isPaid" type="checkbox" />
              Ya cobrada
            </label>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Serie</label>
            <Input defaultValue={editing?.device.serialNumber ?? ""} key={`${editing?.id}-serial`} name="serialNumber" placeholder="Numero de serie" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Garantia hasta</label>
            <Input defaultValue={editing?.warrantyUntil ?? ""} key={`${editing?.id}-warranty`} name="warrantyUntil" type="date" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Accesorios</label>
            <Input defaultValue={editing?.device.accessoryDetails ?? ""} key={`${editing?.id}-accessories`} name="accessoryDetails" placeholder="Control remoto, fuente..." />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Estado visual</label>
            <Input defaultValue={editing?.device.visualCondition ?? ""} key={`${editing?.id}-visual`} name="visualCondition" placeholder="Golpes, pantalla, faltantes..." />
          </div>

          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-slate-700">Direccion cliente</label>
            <Input defaultValue={editing?.customer.address || ""} key={`${editing?.id}-contact-extra`} name="customerAddress" placeholder="Direccion o referencia" />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-slate-700">Notas de cobro</label>
            <Input defaultValue={editing?.paymentNotes ?? ""} key={`${editing?.id}-payment-notes`} name="paymentNotes" placeholder="Senia, saldo, acuerdo..." />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Trabajo realizado</label>
            <Textarea defaultValue={editing?.workPerformed ?? ""} key={`${editing?.id}-work`} name="workPerformed" placeholder="Detalle tecnico" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Repuestos usados</label>
            <Textarea defaultValue={editing?.usedParts ?? ""} key={`${editing?.id}-parts`} name="usedParts" placeholder="Repuestos o insumos" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Condiciones garantia</label>
            <Textarea defaultValue={editing?.warrantyConditions ?? ""} key={`${editing?.id}-warranty-conditions`} name="warrantyConditions" placeholder="Condiciones" />
          </div>

          <div className="lg:col-span-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">Notas generales</label>
            <Textarea defaultValue={editing?.notes ?? ""} key={`${editing?.id}-notes`} name="notes" placeholder="Observaciones internas, checklist o detalle del service" />
          </div>

          <div className="flex items-end gap-2 lg:col-span-6 lg:justify-end">
            {editing ? <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancelar</Button> : null}
            <Button type="submit">{editing ? "Actualizar orden" : "Crear orden Access"}</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Clientes importados desde Access</p>
            <h2 className="text-xl font-semibold text-slate-950">Base de clientes</h2>
          </div>
          {latestImport ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Ultima importacion: {latestImport.importedCount} cargados, {latestImport.errorCount} con error
            </div>
          ) : null}
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-100">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Telefono</th>
                  <th className="px-4 py-3 font-medium">DNI</th>
                  <th className="px-4 py-3 font-medium">Direccion</th>
                  <th className="px-4 py-3 font-medium">Origen</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr className="border-t border-slate-100" key={customer.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{customer.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.phone || customer.alternatePhone || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.dni || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.address || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Pago</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const orderAmount = order.finalAmount || order.approvedAmount || order.budgetAmount;
                const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");

                return (
                  <tr className="border-t border-slate-100" key={order.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{order.customer.fullName}</p>
                        <p className="text-xs text-slate-500">{order.customer.phone || order.customer.dni || "Sin dato extra"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>
                        <p>{deviceLabel || order.device.deviceType}</p>
                        <p className="text-xs text-slate-500">{order.issueReported}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(order.intakeDate)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={order.isPaid ? "success" : "default"}>{order.status.replaceAll("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(orderAmount)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {order.isPaid ? `Cobrada - ${order.paymentMethod}` : order.paymentMethod}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => setEditing(order)} size="sm" type="button" variant="secondary">Editar</Button>
                        <form action={deleteRepairAccessOrderAction}>
                          <input name="id" type="hidden" value={order.id} />
                          <Button size="sm" type="submit" variant="danger">Eliminar</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
