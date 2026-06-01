"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteRepairAccessOrderAction } from "@/features/repairs-access/actions";
import {
  getRepairAccessPaymentLabel,
  getRepairAccessStatusLabel
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { repairAccessStatusValues } from "@/features/repairs-access/schemas";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairAccessOrdersSection({
  orders,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onEdit
}: {
  orders: RepairAccessOrderRecord[];
  search: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onEdit: (order: RepairAccessOrderRecord) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === "todos" || order.status === statusFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      order.customer.fullName,
      order.customer.phone,
      order.customer.dni,
      order.device.deviceType,
      order.device.brand,
      order.device.model,
      order.device.serialNumber,
      order.issueReported,
      order.status
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Ordenes de service</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Seguimiento operativo</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Filtro para saber rapidamente que esta pendiente, en revision, presupuestado, terminado o listo para retirar.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[520px]">
          <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="Cliente, equipo, serie o falla..." value={search} />
          <Select
            name="statusFilter"
            onChange={(event) => onStatusFilterChange(event.target.value)}
            options={[{ value: "todos", label: "Todos los estados" }, ...repairAccessStatusValues.map((status) => ({ value: status, label: getRepairAccessStatusLabel(status) }))]}
            value={statusFilter}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo / falla</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Medio</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length ? (
                filteredOrders.map((order) => {
                  const orderAmount = order.finalAmount || order.approvedAmount || order.budgetAmount;
                  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");

                  return (
                    <tr className="border-t border-slate-100 align-top" key={order.id}>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">{order.customer.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{order.customer.phone || order.customer.dni || "Sin dato extra"}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        <p className="font-medium text-slate-800">{deviceLabel || "Equipo"}</p>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{order.issueReported}</p>
                        {order.device.serialNumber ? <p className="mt-1 text-xs text-slate-400">Serie: {order.device.serialNumber}</p> : null}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(order.intakeDate)}</td>
                      <td className="px-4 py-4"><RepairAccessStatusBadge status={order.status} /></td>
                      <td className="px-4 py-4 text-slate-600">{formatCurrency(orderAmount)}</td>
                      <td className="px-4 py-4 text-slate-600">
                        <p>{getRepairAccessPaymentLabel(order.paymentMethod)}</p>
                        <p className="mt-1 text-xs text-slate-400">{order.isPaid ? "Cobrada" : "Sin cobrar"}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button onClick={() => onEdit(order)} size="sm" type="button" variant="secondary">Editar</Button>
                          <form action={deleteRepairAccessOrderAction}>
                            <input name="id" type="hidden" value={order.id} />
                            <Button size="sm" type="submit" variant="danger">Eliminar</Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    No hay ordenes para esa busqueda o estado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
