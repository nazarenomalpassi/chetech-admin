"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteRepairAccessOrderAction } from "@/features/repairs-access/actions";
import {
  getRepairAccessPaymentLabel,
  getRepairAccessStatusLabel,
  repairAccessStatusOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import { RepairAccessWhatsAppButton } from "@/features/repairs-access/components/repair-access-whatsapp-actions";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairAccessOrdersSection({
  orders,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onEdit,
  onOpenDetail
}: {
  orders: RepairAccessOrderRecord[];
  search: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === "todos" || order.status === statusFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      order.repairNumber,
      order.customer.fullName,
      order.customer.phone,
      order.customer.alternatePhone,
      order.customer.dni,
      order.device.deviceType,
      order.device.brand,
      order.device.model,
      order.device.serialNumber,
      order.issueReported,
      getRepairAccessStatusLabel(order.status),
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
            Busca por numero REP, cliente, telefono, equipo, serie o estado. El numero REP es la referencia fisica para pegar en el equipo.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[560px]">
          <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="REP, cliente, telefono, serie..." value={search} />
          <Select
            name="statusFilter"
            onChange={(event) => onStatusFilterChange(event.target.value)}
            options={[{ value: "todos", label: "Todos los estados" }, ...repairAccessStatusOptions]}
            value={statusFilter}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Orden</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo / falla</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Importes</th>
                <th className="px-4 py-3 font-medium">Tecnico</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length ? (
                filteredOrders.map((order) => {
                  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");

                  return (
                    <tr className="border-t border-slate-100 align-top" key={order.id}>
                      <td className="px-4 py-4">
                        <button className="font-semibold text-brand-700 hover:text-brand-900" onClick={() => onOpenDetail(order)} type="button">
                          {order.repairNumber}
                        </button>
                        <p className="mt-1 text-xs text-slate-400">Ref. fisica</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">{order.customer.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{order.customer.phone || order.customer.dni || "Sin dato extra"}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        <p className="font-medium text-slate-800">{deviceLabel || "Equipo"}</p>
                        {order.device.serialNumber ? <p className="mt-1 text-xs text-slate-400">Serie: {order.device.serialNumber}</p> : null}
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{order.issueReported}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(order.intakeDate)}</td>
                      <td className="px-4 py-4"><RepairAccessStatusBadge status={order.status} /></td>
                      <td className="px-4 py-4 text-slate-600">
                        <p>Pres.: {formatCurrency(order.budgetAmount)}</p>
                        <p className="mt-1 text-xs text-slate-500">Final: {formatCurrency(order.finalAmount)}</p>
                        <p className="mt-1 text-xs text-slate-400">{order.isPaid ? `Cobrada - ${getRepairAccessPaymentLabel(order.paymentMethod)}` : "Sin cobrar"}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{order.technicianName || "-"}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <RepairAccessWhatsAppButton order={order} />
                          <Button onClick={() => onOpenDetail(order)} size="sm" type="button">Ver detalle</Button>
                          <Button onClick={() => onEdit(order)} size="sm" type="button" variant="secondary">Editar ingreso</Button>
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
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
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
