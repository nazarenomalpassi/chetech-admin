"use client";

import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardPenLine,
  FileText,
  Globe2,
  Phone,
  Wrench
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { LazyDisclosure } from "@/components/ui/lazy-disclosure";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelRepairAccessOrderAction,
  updateRepairAccessWorkshopAction
} from "@/features/repairs-access/actions";
import { repairAccessStatusOptions } from "@/features/repairs-access/components/repair-access-helpers";
import { RepairCustomerPortalForm } from "@/features/repairs-access/components/repair-customer-portal-form";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import { RepairAccessWarrantyBadge } from "@/features/repairs-access/components/repair-access-warranty-badge";
import { RepairAccessWhatsAppButton } from "@/features/repairs-access/components/repair-access-whatsapp-actions";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { OrderCoordinationPanel, type WorkshopTechnician } from "./order-coordination-panel";
import { TECHNICAL_WORKSHOP_STATUSES } from "../workflow";
import { RepairAttachments } from "./repair-attachments";
import { WorkshopForm } from "./workshop-form";
import { ReadyForPickupRequirements } from "./ready-for-pickup-requirements";
import { RepairQuickEditor } from "./repair-quick-editor";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { WarrantyReturnPanel } from "./warranty-return-panel";
import { RepairDocumentShareActions } from "./repair-document-share-actions";
import { getWorkshopOrderSummary } from "../workshop-order-summary";
import { WorkshopOrderNextStep } from "./workshop-order-next-step";
import { RepairOrderCollectionActions } from "./repair-order-collection-actions";
import { confirmSubmit } from "@/components/ui/confirm-dialog";

export function RepairAccessWorkshopCard({
  order,
  technicians,
  canManageIntake,
  defaultWarrantyDays,
  onEdit,
  onOpenDetail
}: {
  order: RepairAccessOrderRecord;
  technicians?: WorkshopTechnician[];
  canManageIntake: boolean;
  defaultWarrantyDays?: number;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model]
    .filter(Boolean)
    .join(" - ");
  const phone = order.customer.phone || order.customer.alternatePhone;
  const repairAmount = order.finalAmount || order.budgetAmount;
  const quoteAmount = order.budgetAmount || order.finalAmount;
  const delivered = order.status === "retirado" || Boolean(order.deliveredAt);
  const summary = getWorkshopOrderSummary(order);
  const activeReturn = summary.activeReturn;

  const daysInShop = (() => {
    const from = Date.parse(`${order.intakeDate}T00:00:00Z`);
    if (Number.isNaN(from)) return null;
    const until = delivered && order.deliveredAt ? Date.parse(order.deliveredAt) : Date.now();
    return Math.max(0, Math.floor((until - from) / 86_400_000));
  })();

  return (
    <article className="workshop-card group/card min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <header className="min-w-0 px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            {canManageIntake ? (
              <button
                aria-label={`Abrir orden ${order.repairNumber}`}
                className="-mx-1 rounded-md px-1 font-mono text-lg leading-7 font-semibold tracking-tight wrap-anywhere text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden"
                onClick={() => onOpenDetail(order)}
                type="button"
              >
                {order.repairNumber}
              </button>
            ) : (
              <p className="font-mono text-lg leading-7 font-semibold tracking-tight wrap-anywhere text-foreground">
                {order.repairNumber}
              </p>
            )}
            <RepairAccessStatusBadge status={summary.status} />
            <RepairAccessWarrantyBadge warranty={order.warranty} />
          </div>
          {daysInShop !== null ? (
            <p
              className={cn(
                "shrink-0 text-sm leading-7 tabular-nums",
                !delivered && daysInShop > 30 ? "font-medium text-warning" : "text-muted-foreground"
              )}
              title={delivered ? "Días que estuvo en el local" : "Días en el local"}
            >
              {daysInShop === 1 ? "1 día" : `${daysInShop} días`}
            </p>
          ) : null}
        </div>
        <p className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 text-base leading-6">
          <span className="font-semibold wrap-break-word text-foreground">
            {order.customer.fullName}
          </span>
          {phone ? (
            <span className="text-sm text-muted-foreground tabular-nums">{phone}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm leading-5 wrap-break-word text-muted-foreground">
          {deviceLabel || "Equipo sin descripción"}
        </p>
      </header>

      <div className="space-y-3 px-4 pb-4">
        <WorkshopOrderNextStep compact repairNumber={order.repairNumber} summary={summary} />
        <WarrantyReturnPanel order={order} canManage={canManageIntake} />

        <section className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wrench aria-hidden="true" className="h-4 w-4" />
            {activeReturn ? "Falla original" : "Falla reportada"}
          </p>
          <p className="mt-1 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground">
            {order.issueReported || "Sin falla declarada"}
          </p>
        </section>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
          <WorkshopMeta
            icon={CircleDollarSign}
            label={activeReturn ? "Monto original" : "Monto actual"}
            value={repairAmount ? formatCurrency(repairAmount) : "Sin cargar"}
          />
          <WorkshopMeta
            icon={CalendarDays}
            label={activeReturn ? "Ingreso original" : "Ingreso"}
            value={formatDate(order.intakeDate)}
          />
          {order.budgetDetail ? (
            <WorkshopMeta
              className="col-span-2"
              icon={FileText}
              label={activeReturn ? "Presupuesto original" : "Presupuesto"}
              value={order.budgetDetail}
            />
          ) : null}
          {order.repairProgress ? (
            <WorkshopMeta
              className="col-span-2"
              icon={ClipboardPenLine}
              label={activeReturn ? "Avance original" : "Último avance"}
              value={order.repairProgress}
            />
          ) : null}
        </dl>

        {!activeReturn && (!delivered || (canManageIntake && order.workflow)) ? (
          <LazyDisclosure
            className="group overflow-hidden rounded-lg border border-border-strong bg-card shadow-[var(--shadow-panel)]"
            summaryClassName="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden"
            summary={
              <>
                <span className="flex items-center gap-2">
                  <ClipboardPenLine aria-hidden="true" className="h-4 w-4" />
                  {delivered ? "Corregir garantía" : "Actualizar trabajo"}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-5 w-5 transition-transform duration-200 group-open:rotate-180"
                />
              </>
            }
          >
            {order.workflow ? (
              <RepairQuickEditor
                order={order}
                canManage={canManageIntake}
                defaultWarrantyDays={defaultWarrantyDays}
              />
            ) : (
              <WorkshopCardForm order={order}>
                <input name="id" type="hidden" value={order.id} />

                <ReadyForPickupRequirements
                  workflow={order.workflow}
                  status={order.status}
                  canManage={canManageIntake}
                />

                <label>
                  <span className="mb-2 block text-sm font-medium text-body">
                    Estado de la orden
                  </span>
                  <Select
                    defaultValue={order.status}
                    id={`workshop-${order.id}-status`}
                    name="status"
                    options={repairAccessStatusOptions.filter(
                      (option) =>
                        TECHNICAL_WORKSHOP_STATUSES.includes(option.value) ||
                        option.value === order.status
                    )}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-medium text-body">
                    Presupuesto · visible para el cliente
                  </span>
                  <Input
                    defaultValue={quoteAmount ? String(quoteAmount) : ""}
                    disabled={order.isPaid}
                    inputMode="decimal"
                    id={`workshop-${order.id}-amount`}
                    min={0}
                    name="repairAmount"
                    placeholder="Ej: 125000"
                    step="0.01"
                    type="number"
                  />
                  <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
                    {order.isPaid
                      ? "El monto queda protegido porque la orden ya fue cobrada."
                      : "Importe presupuestado o acordado con el cliente."}
                  </span>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-medium text-body">
                    Detalle del presupuesto · visible para el cliente
                  </span>
                  <Textarea
                    className="min-h-24"
                    defaultValue={order.budgetDetail ?? ""}
                    maxLength={2000}
                    name="budgetDetail"
                    id={`workshop-${order.id}-budget`}
                    placeholder="Trabajo a realizar, repuestos y alcance del presupuesto"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-medium text-body">
                    Avance de reparación · visible para el cliente
                  </span>
                  <Textarea
                    className="min-h-24"
                    defaultValue={order.repairProgress ?? ""}
                    maxLength={2000}
                    name="repairProgress"
                    id={`workshop-${order.id}-progress`}
                    placeholder="Que se reviso, que se hizo y que falta"
                  />
                </label>

                <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3 text-sm">
                  <input className="mt-1" type="checkbox" name="qualityChecked" />
                  Verifique la falla reparada, el funcionamiento y los accesorios antes de marcar
                  listo.
                </label>
                <label>
                  <span className="mb-2 block text-xs font-medium text-muted-foreground">
                    Resultado de las pruebas (opcional)
                  </span>
                  <Textarea name="qualityNotes" maxLength={2000} />
                </label>
                <FormSubmitButton
                  className="min-h-12 w-full"
                  idleLabel="Guardar actualización"
                  pendingLabel="Guardando cambios..."
                />
              </WorkshopCardForm>
            )}
          </LazyDisclosure>
        ) : null}

        <RepairOrderCollectionActions order={order} canManage={canManageIntake} />
        <RepairDocumentShareActions
          key={order.id}
          order={order}
          canManageIntake={canManageIntake}
        />
        {order.workflow ? (
          <LazyDisclosure
            className="border-t border-border"
            summaryClassName="min-h-10 cursor-pointer rounded-lg py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
            summary={delivered ? "Historial de la orden original" : "Coordinación y repuestos"}
          >
            <OrderCoordinationPanel
              compact
              order={order}
              canManage={canManageIntake}
              technicians={technicians}
            />
          </LazyDisclosure>
        ) : null}
        {order.workflow ? <RepairAttachments orderId={order.id} /> : null}

        <LazyDisclosure
          className="group border-t border-border"
          summaryClassName="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden"
          summary={
            <>
              <span className="flex items-center gap-2">
                <Globe2 aria-hidden="true" className="h-4 w-4" />
                Portal del cliente
              </span>
              <ChevronDown
                aria-hidden="true"
                className="h-5 w-5 transition-transform duration-200 group-open:rotate-180"
              />
            </>
          }
        >
          <RepairCustomerPortalForm
            embedded
            key={`portal-${order.id}`}
            order={order}
            returnToOrders
          />
        </LazyDisclosure>

        {/* El pie se acomoda al ancho de la tarjeta: en columnas angostas WhatsApp y Llamar
            quedan solo con el ícono para que "Ficha completa" no se salga. */}
        <div className="@container flex items-center justify-between gap-2 border-t border-border pt-3">
          <div
            data-workshop-contact-actions="true"
            className={canManageIntake ? "hidden shrink-0 grid-cols-2 gap-2 lg:grid" : "hidden"}
          >
            {phone ? (
              <>
                <RepairAccessWhatsAppButton
                  label="WhatsApp"
                  labelClassName="@max-[27rem]:sr-only"
                  order={order}
                  size="sm"
                />
                <a
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  href={`tel:${phone.replace(/\D+/g, "")}`}
                  title={`Llamar al ${phone}`}
                >
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  <span className="@max-[27rem]:sr-only">Llamar</span>
                </a>
              </>
            ) : (
              // Sin teléfono no hay a quién escribir ni llamar: un aviso, no dos botones apagados.
              <span className="col-span-2 self-center text-sm text-muted-foreground">
                Sin teléfono
              </span>
            )}
          </div>

          {canManageIntake ? (
            <div className="ml-auto flex items-center gap-2">
              <Button
                className="whitespace-nowrap"
                onClick={() => onOpenDetail(order)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Ficha completa
              </Button>
              <ActionMenu iconOnly label="Más acciones">
                <a
                  className={buttonVariants({ variant: "secondary" })}
                  href={`/reparaciones?rep=${encodeURIComponent(order.repairNumber)}`}
                >
                  Registrar cobro
                </a>
                <Button
                  className="w-full"
                  onClick={() => onEdit(order)}
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
                  <Button className="w-full" type="submit" variant="danger">
                    Anular orden
                  </Button>
                </form>
              </ActionMenu>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function WorkshopCardForm({
  order,
  children
}: {
  order: RepairAccessOrderRecord;
  children: React.ReactNode;
}) {
  return order.workflow ? (
    <WorkshopForm orderId={order.id} orderVersion={order.workflow.version}>
      {children}
    </WorkshopForm>
  ) : (
    <form
      action={updateRepairAccessWorkshopAction}
      data-workshop-form
      className="grid gap-4 border-t border-border p-4"
    >
      {children}
    </form>
  );
}

function WorkshopMeta({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 leading-5 font-medium wrap-break-word text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}
