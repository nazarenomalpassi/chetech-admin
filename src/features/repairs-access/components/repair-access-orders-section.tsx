"use client";

import { useEffect, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cancelRepairAccessOrderAction } from "@/features/repairs-access/actions";
import {
  getRepairAccessPaymentLabel,
  getRepairAccessStatusLabel,
  repairAccessStatusOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import { RepairAccessWarrantyBadge } from "@/features/repairs-access/components/repair-access-warranty-badge";
import { RepairAccessWhatsAppButton } from "@/features/repairs-access/components/repair-access-whatsapp-actions";
import { RepairAccessWorkshopCard } from "@/features/repairs-access/components/repair-access-workshop-card";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import {
  getNextWorkshopVisibleLimit,
  getVisibleWorkshopOrders,
  WORKSHOP_INITIAL_VISIBLE_ORDERS
} from "@/features/repairs-access/workshop-list-visibility";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { WorkshopTechnician } from "./order-coordination-panel";

export function RepairAccessOrdersSection({
  orders,
  technicians,
  search,
  statusFilter,
  warrantyFilter,
  onSearchChange,
  onStatusFilterChange,
  onWarrantyFilterChange,
  onEdit,
  onOpenDetail,
  onNew,
  headingRef,
  canManageIntake
}: {
  orders: RepairAccessOrderRecord[];
  technicians?: WorkshopTechnician[];
  search: string;
  statusFilter: string;
  warrantyFilter: string;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onWarrantyFilterChange: (value: string) => void;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
  onNew?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  canManageIntake: boolean;
}) {
  const [visibleLimit, setVisibleLimit] = useState(WORKSHOP_INITIAL_VISIBLE_ORDERS);
  const [presentation, setPresentation] = useState<"cards" | "table">("cards");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === "todos" || order.status === statusFilter;
    if (!matchesStatus) return false;
    const matchesWarranty =
      warrantyFilter === "todos" ||
      (warrantyFilter === "active" &&
        ["active", "expires_today"].includes(order.warranty.code)) ||
      order.warranty.code === warrantyFilter;
    if (!matchesWarranty) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      order.repairNumber,
      order.legacyOrderNumber,
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
  const visibleOrders = getVisibleWorkshopOrders(filteredOrders, visibleLimit);

  useEffect(() => {
    setVisibleLimit(WORKSHOP_INITIAL_VISIBLE_ORDERS);
  }, [normalizedSearch, statusFilter, warrantyFilter]);

  function togglePresentation() {
    if (document.documentElement.hasAttribute("data-unsaved-changes") && !window.confirm("Hay cambios sin guardar. El borrador queda disponible para recuperarlo. Queres cambiar la vista?")) return;
    setPresentation((current) => current === "cards" ? "table" : "cards");
  }

  return (
    <Card className="space-y-4 sm:space-y-5">
      <div className="grid min-w-0 gap-4 min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] min-[1600px]:items-end">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-700 sm:text-xs sm:tracking-[0.28em]">Ordenes de service</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950 outline-none sm:text-3xl" ref={headingRef} tabIndex={-1}>Mesa de trabajo</h2>
            {canManageIntake && onNew ? <Button onClick={onNew} type="button">Nueva orden</Button> : null}
          </div>
          <p className="mt-2 max-w-2xl text-[0.84rem] leading-6 text-slate-500 sm:text-sm">
            Encontra la orden por numero, equipo, cliente o falla y actualiza el trabajo sin salir del listado.
          </p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Input
            aria-label="Buscar orden de service"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Numero de orden, equipo o falla..."
            value={search}
          />
          <Select
            aria-label="Filtrar ordenes por estado"
            name="statusFilter"
            onChange={(event) => onStatusFilterChange(event.target.value)}
            options={[{ value: "todos", label: "Todos los estados" }, ...repairAccessStatusOptions]}
            value={statusFilter}
          />
          <details className="min-w-0 sm:col-span-2" open={warrantyFilter !== "todos" ? true : undefined}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40">Filtros</summary>
            <div className="pt-2 sm:max-w-sm">
              <Select
                aria-label="Filtrar ordenes por garantia"
                name="warrantyFilter"
                onChange={(event) => onWarrantyFilterChange(event.target.value)}
                options={[
                  { value: "todos", label: "Todas las garantias" },
                  { value: "active", label: "Garantia vigente" },
                  { value: "expired", label: "Garantia vencida" },
                  { value: "pending_delivery", label: "Pendiente de retiro" },
                  { value: "needs_review", label: "Garantia incompleta" },
                  { value: "none", label: "Sin garantia" }
                ]}
                value={warrantyFilter}
              />
            </div>
          </details>
        </div>
      </div>

      {canManageIntake ? (
        <div aria-label="Presentacion de ordenes" className="flex justify-end">
          <Button aria-pressed={presentation === "table"} onClick={togglePresentation} type="button" variant="ghost">
            {presentation === "cards" ? "Ver tabla" : "Ver tarjetas"}
          </Button>
        </div>
      ) : null}

      {!canManageIntake || presentation === "cards" ? (
      <div className="grid items-start gap-3 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:grid-cols-2 2xl:grid-cols-3">
        {visibleOrders.length ? (
          visibleOrders.map((order) => (
            <RepairAccessWorkshopCard
              canManageIntake={canManageIntake}
              technicians={technicians}
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
      ) : (
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
                <th className="px-4 py-3 font-medium">Garantia</th>
                <th className="px-4 py-3 font-medium">Importes</th>
                <th className="px-4 py-3 font-medium">Tecnico</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length ? (
                visibleOrders.map((order) => {
                  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");

                  return (
                    <tr className="border-t border-slate-100 align-top" key={order.id}>
                      <td className="px-4 py-4">
                        <button className="whitespace-nowrap font-semibold text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40" onClick={() => onOpenDetail(order)} type="button">
                          {order.repairNumber}
                        </button>
                        <p className="mt-1 text-xs text-slate-400">Referencia fisica</p>
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
                      <td className="px-4 py-4">
                        <RepairAccessWarrantyBadge warranty={order.warranty} />
                        {order.warranty.expiresOn ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Hasta {formatDate(order.warranty.expiresOn)}
                          </p>
                        ) : null}
                      </td>
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
                          {canManageIntake ? (
                            <>
                              <Button onClick={() => onEdit(order)} size="sm" type="button" variant="secondary">Editar ingreso</Button>
                              <form action={cancelRepairAccessOrderAction}>
                                <input name="id" type="hidden" value={order.id} />
                                <Button size="sm" type="submit" variant="danger">Anular</Button>
                              </form>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    No hay ordenes para esa busqueda o estado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {visibleOrders.length < filteredOrders.length ? (
        <div className="flex flex-col items-center gap-2 border-t border-graphite/8 pt-4 sm:flex-row sm:justify-between">
          <p className="text-xs text-slate-500">
            Mostrando {visibleOrders.length} de {filteredOrders.length} ordenes encontradas.
          </p>
          <Button
            onClick={() => setVisibleLimit((current) => getNextWorkshopVisibleLimit(current, filteredOrders.length))}
            type="button"
            variant="secondary"
          >
            Cargar mas ordenes
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
