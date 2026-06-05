"use client";

import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cancelRepairAccessOrderAction, updateRepairAccessStatusAction } from "@/features/repairs-access/actions";
import {
  getRepairAccessPaymentLabel,
  getRepairAccessStatusLabel,
  repairAccessStatusOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import { RepairAccessWhatsAppButton } from "@/features/repairs-access/components/repair-access-whatsapp-actions";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

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
    <Card className="space-y-4 sm:space-y-5">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-700 sm:text-xs sm:tracking-[0.28em]">Ordenes de service</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">Seguimiento operativo</h2>
          <p className="mt-2 max-w-2xl text-[0.84rem] leading-6 text-slate-500 sm:text-sm">
            Busca por numero REP, cliente, telefono, equipo, serie o estado. El numero REP es la referencia fisica para pegar en el equipo.
          </p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:min-w-[560px]">
          <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="REP, cliente, telefono, serie..." value={search} />
          <Select
            name="statusFilter"
            onChange={(event) => onStatusFilterChange(event.target.value)}
            options={[{ value: "todos", label: "Todos los estados" }, ...repairAccessStatusOptions]}
            value={statusFilter}
          />
        </div>
      </div>

      <div className="grid gap-3 pb-[calc(0.25rem+env(safe-area-inset-bottom))] lg:hidden">
        {filteredOrders.length ? (
          filteredOrders.map((order) => (
            <RepairAccessOrderMobileCard
              key={order.id}
              onEdit={onEdit}
              onOpenDetail={onOpenDetail}
              order={order}
            />
          ))
        ) : (
          <div className="rounded-[24px] border border-dashed border-graphite/15 bg-white/75 px-4 py-8 text-center text-sm leading-6 text-slate-500">
            No hay ordenes para esa busqueda o estado.
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-slate-100 lg:block">
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
                          <form action={cancelRepairAccessOrderAction}>
                            <input name="id" type="hidden" value={order.id} />
                            <Button size="sm" type="submit" variant="danger">Anular</Button>
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

function RepairAccessOrderMobileCard({
  order,
  onEdit,
  onOpenDetail
}: {
  order: RepairAccessOrderRecord;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const deviceLabel = getDeviceLabel(order);
  const phone = order.customer.phone || order.customer.alternatePhone;
  const amountLabel = order.finalAmount || order.budgetAmount;

  return (
    <article className="min-w-0 rounded-[24px] border border-graphite/10 bg-white/90 p-4 shadow-panel">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <button
          className="min-w-0 text-left text-2xl font-semibold tracking-[-0.04em] text-slate-950"
          onClick={() => onOpenDetail(order)}
          type="button"
        >
          <span className="block truncate">{order.repairNumber}</span>
        </button>
        <div className="shrink-0">
          <RepairAccessStatusBadge status={order.status} />
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <MobileOrderField label="Cliente">
          <span className="font-semibold text-slate-950">{order.customer.fullName}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{phone ? `Tel: ${phone}` : order.customer.dni ? `DNI: ${order.customer.dni}` : "Sin telefono cargado"}</span>
        </MobileOrderField>

        <MobileOrderField label="Equipo">
          <span className="font-semibold text-slate-800">{deviceLabel || "Equipo sin descripcion"}</span>
          {order.device.serialNumber ? <span className="mt-0.5 block text-xs text-slate-500">Serie: {order.device.serialNumber}</span> : null}
        </MobileOrderField>

        <MobileOrderField label="Falla">
          <p className="whitespace-pre-wrap break-words leading-6 text-slate-700">{order.issueReported || "Sin falla declarada"}</p>
        </MobileOrderField>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-[20px] bg-slate-50 p-3 text-xs text-slate-600">
        <div className="min-w-0">
          <p className="uppercase tracking-[0.16em] text-slate-400">Ingreso</p>
          <p className="mt-1 font-semibold text-slate-800">{formatDate(order.intakeDate)}</p>
        </div>
        <div className="min-w-0">
          <p className="uppercase tracking-[0.16em] text-slate-400">Tecnico</p>
          <p className="mt-1 truncate font-semibold text-slate-800">{order.technicianName || "-"}</p>
        </div>
        <div className="min-w-0">
          <p className="uppercase tracking-[0.16em] text-slate-400">Importe</p>
          <p className="mt-1 font-semibold text-slate-800">{amountLabel ? formatCurrency(amountLabel) : "Sin cargar"}</p>
        </div>
        <div className="min-w-0">
          <p className="uppercase tracking-[0.16em] text-slate-400">Cobro</p>
          <p className="mt-1 truncate font-semibold text-slate-800">{order.isPaid ? getRepairAccessPaymentLabel(order.paymentMethod) : "Sin cobrar"}</p>
        </div>
      </div>

      <form action={updateRepairAccessStatusAction} className="mt-4 rounded-[20px] border border-graphite/10 bg-white p-3">
        <input name="id" type="hidden" value={order.id} />
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cambiar estado</span>
          <Select defaultValue={order.status} name="status" options={repairAccessStatusOptions} />
        </label>
        <Button className="mt-3 w-full" type="submit">Guardar estado</Button>
      </form>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button className="w-full" onClick={() => onOpenDetail(order)} type="button" variant="default">
          Ver detalle
        </Button>
        <Button className="w-full" onClick={() => onEdit(order)} type="button" variant="secondary">
          Editar
        </Button>
        <RepairAccessWhatsAppButton className="w-full" order={order} size="default" />
        {phone ? (
          <a className={cn(buttonVariants({ size: "default", variant: "secondary" }), "w-full")} href={`tel:${phone.replace(/\D+/g, "")}`}>
            Llamar
          </a>
        ) : (
          <span className={cn(buttonVariants({ size: "default", variant: "ghost" }), "w-full cursor-not-allowed opacity-50")}>
            Sin telefono
          </span>
        )}
      </div>

      <form action={cancelRepairAccessOrderAction} className="mt-2">
        <input name="id" type="hidden" value={order.id} />
        <Button className="w-full" type="submit" variant="danger">
          Anular orden
        </Button>
      </form>
    </article>
  );
}

function MobileOrderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[18px] bg-slate-50 px-3 py-2.5">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</dt>
      <dd className="mt-1 min-w-0 overflow-hidden text-slate-700">{children}</dd>
    </div>
  );
}

function getDeviceLabel(order: RepairAccessOrderRecord) {
  return [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");
}
