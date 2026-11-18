"use client";

import { useEffect, useState, useSyncExternalStore, type Ref } from "react";

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
import { confirmSubmit } from "@/components/ui/confirm-dialog";
import { confirmThen } from "@/components/ui/confirm-dialog";

const NARROW_QUERY = "(max-width: 767px)";
function subscribeNarrow(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** En celular la mesa se muestra en tarjetas; en escritorio, en tabla. */
function useNarrowScreen() {
  return useSyncExternalStore(
    subscribeNarrow,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(NARROW_QUERY).matches
        : false,
    () => false
  );
}

function daysInShop(date: string | null | undefined) {
  if (!date) return null;
  const start = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
}

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
  initialPresentation = "table",
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
  /** Vista inicial en escritorio. En celular siempre se usan tarjetas. */
  initialPresentation?: "cards" | "table";
  defaultWarrantyDays?: number;
}) {
  const [visibleLimit, setVisibleLimit] = useState(WORKSHOP_INITIAL_VISIBLE_ORDERS);
  const [presentation, setPresentation] = useState<"cards" | "table">(initialPresentation);
  const narrowScreen = useNarrowScreen();
  const showTable = canManageIntake && presentation === "table" && !narrowScreen;
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
    const toggle = () => setPresentation((current) => (current === "cards" ? "table" : "cards"));
    if (!document.documentElement.hasAttribute("data-unsaved-changes")) return toggle();
    confirmThen(
      {
        title: "¿Cambiar la vista?",
        description: "Hay cambios sin guardar. El borrador queda disponible para recuperarlo.",
        confirmLabel: "Cambiar la vista"
      },
      toggle
    );
  }

  return (
    <section className="min-w-0 space-y-3">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2
              className="text-xl font-semibold text-foreground outline-hidden"
              ref={headingRef}
              tabIndex={-1}
            >
              Mesa de trabajo
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {filteredOrders.length === 1 ? "1 orden" : `${filteredOrders.length} órdenes`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageIntake && !narrowScreen ? (
              <Button
                aria-pressed={presentation === "table"}
                onClick={togglePresentation}
                type="button"
                variant="ghost"
              >
                {presentation === "cards" ? "Ver tabla" : "Ver tarjetas"}
              </Button>
            ) : null}
            {canManageIntake && onNew ? (
              <Button onClick={onNew} type="button">
                Nueva orden
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="grid min-w-0 gap-2 text-sm font-medium text-body">
            <span>Buscar orden</span>
            <Input
              aria-label="Buscar orden de service"
              onChange={(event) => onSearchChange(event.target.value)}
              onCompositionStart={() => onSearchCompositionChange?.(true)}
              onCompositionEnd={() => onSearchCompositionChange?.(false)}
              maxLength={200}
              placeholder="Número de orden, cliente, equipo o falla..."
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
            className="min-w-0 sm:col-span-2 lg:col-span-1"
            open={warrantyFilter !== "todos" ? true : undefined}
          >
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden">
              Filtros
            </summary>
            <div className="pt-2 sm:max-w-sm">
              <Select
                aria-label="Filtrar ordenes por garantía"
                name="warrantyFilter"
                onChange={(event) => onWarrantyFilterChange(event.target.value)}
                options={[
                  { value: "todos", label: "Todas las garantías" },
                  { value: "active", label: "Garantía vigente" },
                  { value: "expired", label: "Garantía vencida" },
                  { value: "pending_delivery", label: "Pendiente de retiro" },
                  { value: "needs_review", label: "Garantía incompleta" },
                  { value: "none", label: "Sin garantía" }
                ]}
                value={warrantyFilter}
              />
            </div>
          </details>
        </div>
      </div>

      {!showTable ? (
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
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2.5 font-medium">Orden</th>
                  <th className="min-w-48 px-2.5 py-2.5 font-medium">Cliente y equipo</th>
                  <th className="px-2.5 py-2.5 font-medium">Falla</th>
                  <th className="px-2.5 py-2.5 font-medium">En el local</th>
                  <th className="px-2.5 py-2.5 font-medium">Importes</th>
                  <th className="px-2.5 py-2.5 font-medium">Próximo paso</th>
                  <th className="px-2.5 py-2.5 text-right font-medium">Acciones</th>
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
                      .join(" · ");
                    const summary = getWorkshopOrderSummary(order);
                    const activeReturn = summary.activeReturn;
                    const amount = order.finalAmount || order.budgetAmount;
                    const delivered = Boolean(order.deliveredAt) || order.status === "retirado";
                    const days = delivered
                      ? null
                      : daysInShop(activeReturn?.receivedOn ?? order.intakeDate);

                    return (
                      <tr
                        className="border-t border-border align-top hover:bg-muted/60"
                        key={order.id}
                      >
                        <td className="px-2.5 py-3">
                          <button
                            aria-label={`Ficha completa ${order.repairNumber}`}
                            className="min-h-9 font-semibold whitespace-nowrap text-foreground tabular-nums underline decoration-border-strong underline-offset-4 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden"
                            onClick={() => onOpenDetail(order)}
                            type="button"
                          >
                            {order.repairNumber}
                          </button>
                          <div className="mt-1 flex flex-col items-start gap-1">
                            <RepairAccessStatusBadge status={summary.status} />
                            {order.warranty.code !== "none" ? (
                              <RepairAccessWarrantyBadge warranty={order.warranty} />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2.5 py-3">
                          <p className="font-semibold text-foreground">{order.customer.fullName}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {order.customer.phone || order.customer.dni || "Sin dato extra"}
                          </p>
                          <p className="mt-1 text-body">{deviceLabel || "Equipo"}</p>
                        </td>
                        <td className="max-w-52 px-3 py-3">
                          {activeReturn ? (
                            <>
                              <p className="text-xs font-semibold text-warning">
                                Reingreso por garantía activo
                              </p>
                              <p className="mt-1 line-clamp-3 leading-5 font-medium wrap-anywhere text-foreground">
                                {activeReturn.issueReported}
                              </p>
                            </>
                          ) : null}
                          <p
                            className={
                              activeReturn
                                ? "mt-1 line-clamp-2 text-xs leading-5 wrap-anywhere text-muted-foreground"
                                : "line-clamp-3 leading-5 wrap-anywhere text-body"
                            }
                            title={order.issueReported ?? undefined}
                          >
                            {activeReturn
                              ? `Falla original: ${order.issueReported}`
                              : order.issueReported}
                          </p>
                        </td>
                        <td className="px-2.5 py-3 whitespace-nowrap">
                          <p className="text-body tabular-nums">
                            {formatDate(activeReturn?.receivedOn ?? order.intakeDate)}
                          </p>
                          {days !== null ? (
                            <p
                              className={
                                days > 30
                                  ? "text-xs font-semibold text-warning"
                                  : "text-xs text-muted-foreground"
                              }
                            >
                              {days === 1 ? "1 día" : `${days} días`}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Entregado</p>
                          )}
                        </td>
                        <td className="px-2.5 py-3 whitespace-nowrap">
                          {activeReturn ? (
                            <p className="text-xs font-medium text-muted-foreground">
                              Orden original
                            </p>
                          ) : null}
                          <p className="text-body tabular-nums">
                            {amount ? formatCurrency(amount) : "Sin presupuesto"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.isPaid
                              ? `Cobrada - ${getRepairAccessPaymentLabel(order.paymentMethod)}`
                              : "Sin cobrar"}
                          </p>
                        </td>
                        <td className="min-w-40 px-3 py-3">
                          <WorkshopOrderNextStep
                            compact
                            repairNumber={order.repairNumber}
                            summary={summary}
                          />
                        </td>
                        <td className="px-2.5 py-3">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            <RepairAccessWhatsAppButton order={order} />
                            {canManageIntake ? (
                              <ActionMenu iconOnly label="Más acciones">
                                <Button
                                  onClick={() => onOpenDetail(order)}
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                >
                                  Ficha completa
                                </Button>
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
                                  onSubmit={(event) =>
                                    confirmSubmit(event, {
                                      title: `¿Anular la orden ${order.repairNumber}?`,
                                      description: "Se conserva todo el historial de la orden.",
                                      confirmLabel: "Anular orden",
                                      tone: "danger"
                                    })
                                  }
                                >
                                  <input name="id" type="hidden" value={order.id} />
                                  <Button size="sm" type="submit" variant="danger">
                                    Anular
                                  </Button>
                                </form>
                              </ActionMenu>
                            ) : null}
                          </div>
                          <div className="mt-2 empty:hidden">
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
                                    ? "Corregir garantía"
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
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
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
            Cargar más ordenes
          </Button>
        </div>
      ) : null}
    </section>
  );
}
