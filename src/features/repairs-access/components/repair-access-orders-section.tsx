"use client";

import { useEffect, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Input } from "@/components/ui/input";
import { LazyDisclosure } from "@/components/ui/lazy-disclosure";
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
import { normalizeRepairAccessLookup } from "../customer-search";
import { RepairQuickEditor } from "./repair-quick-editor";
import { WarrantyReturnCase } from "./warranty-return-panel";
import { getWorkshopOrderSummary } from "../workshop-order-summary";
import { WorkshopOrderNextStep } from "./workshop-order-next-step";

export function RepairAccessOrdersSection({
  orders,
  technicians,
  search,
  statusFilter,
  warrantyFilter,
  onSearchChange,
  onSearchCompositionChange,
  onStatusFilterChange,
  onWarrantyFilterChange,
  onEdit,
  onOpenDetail,
  onNew,
  headingRef,
  canManageIntake,
  defaultWarrantyDays
}: {
  orders: RepairAccessOrderRecord[];
  technicians?: WorkshopTechnician[];
  search: string;
  statusFilter: string;
  warrantyFilter: string;
  onSearchChange: (value: string) => void;
  onSearchCompositionChange?: (composing: boolean) => void;
  onStatusFilterChange: (value: string) => void;
  onWarrantyFilterChange: (value: string) => void;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
  onNew?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  canManageIntake: boolean;
  defaultWarrantyDays?: number;
}) {
  const [visibleLimit, setVisibleLimit] = useState(WORKSHOP_INITIAL_VISIBLE_ORDERS);
  const [presentation, setPresentation] = useState<"cards" | "table">("cards");
  const normalizedSearch = normalizeRepairAccessLookup(search);
  const filteredOrders = orders.filter((order) => {
    const summary = getWorkshopOrderSummary(order);
    const matchesStatus = statusFilter === "todos" || summary.status === statusFilter;
    if (!matchesStatus) return false;
    const matchesWarranty =
      warrantyFilter === "todos" ||
      (warrantyFilter === "pending_delivery" &&
        (Boolean(summary.activeReturn) ||
          (!order.deliveredAt && !order.pickedUpAt && order.status !== "retirado"))) ||
      (warrantyFilter === "active" && ["active", "expires_today"].includes(order.warranty.code)) ||
      order.warranty.code === warrantyFilter;
    if (!matchesWarranty) return false;
    if (!normalizedSearch) return true;

    const haystack = normalizeRepairAccessLookup(
      [
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
        order.technicalDiagnosis,
        order.budgetDetail,
        order.repairProgress,
        summary.activeReturn?.issueReported,
        summary.activeReturn?.progress,
        summary.activeReturn?.resolution,
        getRepairAccessStatusLabel(summary.status),
        getRepairAccessStatusLabel(order.status),
        order.status
      ].join(" ")
    );

    return haystack.includes(normalizedSearch);
  });
  const visibleOrders = getVisibleWorkshopOrders(filteredOrders, visibleLimit);

  useEffect(() => {
    setVisibleLimit(WORKSHOP_INITIAL_VISIBLE_ORDERS);
  }, [normalizedSearch, statusFilter, warrantyFilter]);

  function togglePresentation() {
    if (
      document.documentElement.hasAttribute("data-unsaved-changes") &&
      !window.confirm(
        "Hay cambios sin guardar. El borrador queda disponible para recuperarlo. Queres cambiar la vista?"
      )
    )
      return;
    setPresentation((current) => (current === "cards" ? "table" : "cards"));
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-4 min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] min-[1600px]:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              className="text-xl font-semibold text-foreground outline-hidden"
              ref={headingRef}
              tabIndex={-1}
            >
              Mesa de trabajo
            </h2>
            {canManageIntake && onNew ? (
              <Button onClick={onNew} type="button">
                Nueva orden
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <label className="grid min-w-0 gap-2 text-sm font-medium text-body">
            <span>Buscar orden</span>
            <Input
              aria-label="Buscar orden de service"
              onChange={(event) => onSearchChange(event.target.value)}
              onCompositionStart={() => onSearchCompositionChange?.(true)}
              onCompositionEnd={() => onSearchCompositionChange?.(false)}
              maxLength={200}
              placeholder="Numero de orden, cliente, equipo o falla..."
              value={search}
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium text-body">
            <span>Estado</span>
            <Select
              aria-label="Filtrar ordenes por estado"
              name="statusFilter"
              onChange={(event) => onStatusFilterChange(event.target.value)}
              options={[
                { value: "todos", label: "Todos los estados" },
                ...repairAccessStatusOptions
              ]}
              value={statusFilter}
            />
          </label>
          <details
            className="min-w-0 sm:col-span-2"
            open={warrantyFilter !== "todos" ? true : undefined}
          >
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden">
              Filtros
            </summary>
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
          <Button
            aria-pressed={presentation === "table"}
            onClick={togglePresentation}
            type="button"
            variant="ghost"
          >
            {presentation === "cards" ? "Ver tabla" : "Ver tarjetas"}
          </Button>
        </div>
      ) : null}

      {!canManageIntake || presentation === "cards" ? (
        <div className="grid items-start gap-3 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:grid-cols-2 2xl:grid-cols-3">
          {visibleOrders.length ? (
            visibleOrders.map((order) => (
              <RepairAccessWorkshopCard
                defaultWarrantyDays={defaultWarrantyDays}
                canManageIntake={canManageIntake}
                technicians={technicians}
                key={order.id}
                onEdit={onEdit}
                onOpenDetail={onOpenDetail}
                order={order}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm leading-6 text-muted-foreground md:col-span-2 2xl:col-span-3">
              No hay ordenes para esa busqueda o estado.
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="overflow-x-auto bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Orden</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Equipo / falla</th>
                  <th className="px-4 py-3 font-medium">Ingreso</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Garantia</th>
                  <th className="px-4 py-3 font-medium">Importes</th>
                  <th className="px-4 py-3 font-medium">Proximo paso</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.length ? (
                  visibleOrders.map((order) => {
                    const deviceLabel = [
                      order.device.deviceType,
                      order.device.brand,
                      order.device.model
                    ]
                      .filter(Boolean)
                      .join(" - ");
                    const summary = getWorkshopOrderSummary(order);
                    const activeReturn = summary.activeReturn;

                    return (
                      <tr className="border-t border-border align-top" key={order.id}>
                        <td className="px-4 py-4">
                          <button
                            aria-label={`Ficha completa ${order.repairNumber}`}
                            className="min-h-11 font-semibold whitespace-nowrap text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden"
                            onClick={() => onOpenDetail(order)}
                            type="button"
                          >
                            {order.repairNumber}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-foreground">{order.customer.fullName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.customer.phone || order.customer.dni || "Sin dato extra"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          <p className="font-medium text-foreground">{deviceLabel || "Equipo"}</p>
                          {order.device.serialNumber ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Serie: {order.device.serialNumber}
                            </p>
                          ) : null}
                          {activeReturn ? (
                            <>
                              <p className="mt-2 text-xs font-semibold text-warning">
                                Reingreso por garantia activo
                              </p>
                              <p className="mt-1 max-w-xs text-sm leading-5 font-medium wrap-anywhere wrap-break-word whitespace-pre-wrap text-foreground">
                                {activeReturn.issueReported}
                              </p>
                            </>
                          ) : null}
                          <p className="mt-1 max-w-xs text-xs leading-5 wrap-anywhere wrap-break-word whitespace-pre-wrap text-muted-foreground">
                            {activeReturn
                              ? `Falla original: ${order.issueReported}`
                              : order.issueReported}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {formatDate(activeReturn?.receivedOn ?? order.intakeDate)}
                          {activeReturn ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Reingreso de garantia
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <RepairAccessStatusBadge status={summary.status} />
                        </td>
                        <td className="px-4 py-4">
                          <RepairAccessWarrantyBadge warranty={order.warranty} />
                          {order.warranty.expiresOn ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Hasta {formatDate(order.warranty.expiresOn)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {activeReturn ? (
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              Orden original
                            </p>
                          ) : null}
                          <p>Pres.: {formatCurrency(order.budgetAmount)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Final: {formatCurrency(order.finalAmount)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.isPaid
                              ? `Cobrada - ${getRepairAccessPaymentLabel(order.paymentMethod)}`
                              : "Sin cobrar"}
                          </p>
                        </td>
                        <td className="min-w-52 px-4 py-4">
                          <WorkshopOrderNextStep
                            repairNumber={order.repairNumber}
                            summary={summary}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex min-w-64 flex-wrap justify-end gap-2">
                            <Button
                              onClick={() => onOpenDetail(order)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Ficha completa
                            </Button>
                            {activeReturn ? (
                              <div className="w-full min-w-0 rounded-lg border border-border p-3">
                                <WarrantyReturnCase
                                  key={activeReturn.id}
                                  record={activeReturn}
                                  canManage={canManageIntake}
                                />
                              </div>
                            ) : order.workflow ? (
                              <LazyDisclosure
                                className="w-full rounded-lg border border-border"
                                summaryClassName="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                                summary={
                                  order.status === "retirado" || order.deliveredAt
                                    ? "Corregir garantia"
                                    : "Actualizar trabajo"
                                }
                              >
                                <RepairQuickEditor
                                  order={order}
                                  canManage={canManageIntake}
                                  defaultWarrantyDays={defaultWarrantyDays}
                                />
                              </LazyDisclosure>
                            ) : null}
                            <span className="hidden lg:inline-flex">
                              <RepairAccessWhatsAppButton order={order} />
                            </span>
                            {canManageIntake ? (
                              <ActionMenu label="Mas acciones">
                                <Button
                                  onClick={() => onEdit(order)}
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                >
                                  Editar ingreso
                                </Button>
                                <form
                                  action={cancelRepairAccessOrderAction}
                                  onSubmit={(event) => {
                                    if (
                                      !window.confirm(
                                        `Vas a anular la orden ${order.repairNumber}. Esta accion conserva el historial. Continuar?`
                                      )
                                    )
                                      event.preventDefault();
                                  }}
                                >
                                  <input name="id" type="hidden" value={order.id} />
                                  <Button size="sm" type="submit" variant="danger">
                                    Anular
                                  </Button>
                                </form>
                              </ActionMenu>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={9}>
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
        <div className="flex flex-col items-center gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {visibleOrders.length} de {filteredOrders.length} ordenes encontradas.
          </p>
          <Button
            onClick={() =>
              setVisibleLimit((current) =>
                getNextWorkshopVisibleLimit(current, filteredOrders.length)
              )
            }
            type="button"
            variant="secondary"
          >
            Cargar mas ordenes
          </Button>
        </div>
      ) : null}
    </section>
  );
}
