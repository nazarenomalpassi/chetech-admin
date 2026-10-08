"use client";

import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardPenLine,
  FileText,
  Globe2,
  MonitorCog,
  Phone,
  UserRound,
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

export function RepairAccessWorkshopCard({
  order,
  technicians,
  canManageIntake,
  onEdit,
  onOpenDetail
}: {
  order: RepairAccessOrderRecord;
  technicians?: WorkshopTechnician[];
  canManageIntake: boolean;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");
  const phone = order.customer.phone || order.customer.alternatePhone;
  const repairAmount = order.finalAmount || order.budgetAmount;
  const quoteAmount = order.budgetAmount || order.finalAmount;

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="grid min-w-0 gap-2 border-b border-slate-200 p-4">
        <div className="min-w-0">
          {canManageIntake ? (
            <button
              aria-label={`Abrir orden ${order.repairNumber}`}
              className="block min-h-11 w-full whitespace-normal break-words rounded-lg text-left text-xl font-semibold leading-tight text-slate-950 [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40"
              onClick={() => onOpenDetail(order)}
              type="button"
            >
              {order.repairNumber}
            </button>
          ) : (
            <p className="block w-full whitespace-normal break-words text-xl font-semibold leading-tight text-slate-950 [overflow-wrap:anywhere]">
              {order.repairNumber}
            </p>
          )}
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-start gap-2">
          <RepairAccessStatusBadge status={order.status} />
          <RepairAccessWarrantyBadge warranty={order.warranty} />
        </div>
      </header>

      <div className="space-y-3 p-4">
        <section>
          <div className="flex items-center gap-2 text-slate-500">
            <Wrench aria-hidden="true" className="h-4 w-4" />
            <p className="text-sm font-medium">Falla reportada</p>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">
            {order.issueReported || "Sin falla declarada"}
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <WorkshopInfo icon={MonitorCog} label="Equipo" value={deviceLabel || "Equipo sin descripcion"} />
          <WorkshopInfo icon={UserRound} label="Cliente" value={order.customer.fullName} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-graphite/8 py-3 text-sm">
          <WorkshopMeta icon={CircleDollarSign} label="Monto actual" value={repairAmount ? formatCurrency(repairAmount) : "Sin cargar"} />
          <WorkshopMeta icon={CalendarDays} label="Ingreso" value={formatDate(order.intakeDate)} />
          {order.budgetDetail ? (
            <WorkshopMeta className="col-span-2" icon={FileText} label="Presupuesto" value={order.budgetDetail} />
          ) : null}
          {order.repairProgress ? (
            <WorkshopMeta className="col-span-2" icon={ClipboardPenLine} label="Ultimo avance" value={order.repairProgress} />
          ) : null}
        </div>

        <LazyDisclosure className="group overflow-hidden rounded-xl border border-slate-300 bg-white"
          summaryClassName="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite/40 [&::-webkit-details-marker]:hidden"
          summary={<>
            <span className="flex items-center gap-2">
              <ClipboardPenLine aria-hidden="true" className="h-4 w-4" />
              Actualizar trabajo
            </span>
            <ChevronDown aria-hidden="true" className="h-5 w-5 transition-transform duration-200 group-open:rotate-180" />
          </>}
        >

          {order.workflow ? <RepairQuickEditor order={order} canManage={canManageIntake} /> : <WorkshopCardForm order={order}>
            <input name="id" type="hidden" value={order.id} />

            <ReadyForPickupRequirements workflow={order.workflow} status={order.status} canManage={canManageIntake} />

            <label>
              <span className="mb-2 block text-sm font-medium text-slate-700">Estado de la orden</span>
              <Select defaultValue={order.status} id={`workshop-${order.id}-status`} name="status" options={repairAccessStatusOptions.filter((option) => TECHNICAL_WORKSHOP_STATUSES.includes(option.value) || option.value === order.status)} />
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-slate-700">Presupuesto · visible para el cliente</span>
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
              <span className="mt-1.5 block text-xs leading-5 text-slate-500">
                {order.isPaid ? "El monto queda protegido porque la orden ya fue cobrada." : "Importe presupuestado o acordado con el cliente."}
              </span>
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-slate-700">Detalle del presupuesto · visible para el cliente</span>
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
              <span className="mb-2 block text-sm font-medium text-slate-700">Avance de reparacion · visible para el cliente</span>
              <Textarea
                className="min-h-24"
                defaultValue={order.repairProgress ?? ""}
                maxLength={2000}
                name="repairProgress"
                id={`workshop-${order.id}-progress`}
                placeholder="Que se reviso, que se hizo y que falta"
              />
            </label>

            <label className="flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input className="mt-1" type="checkbox" name="qualityChecked" />Verifique la falla reparada, el funcionamiento y los accesorios antes de marcar listo.</label>
            <label><span className="mb-2 block text-xs font-medium text-slate-500">Resultado de las pruebas (opcional)</span><Textarea name="qualityNotes" maxLength={2000} /></label>
            <FormSubmitButton
              className="min-h-12 w-full"
              idleLabel="Guardar actualizacion"
              pendingLabel="Guardando cambios..."
            />
          </WorkshopCardForm>}
        </LazyDisclosure>

        {canManageIntake ? <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 w-full" onClick={() => onOpenDetail(order)} type="button" variant="secondary">Ficha completa</Button>
        </div> : null}
        {order.workflow ? <LazyDisclosure className="border-t border-slate-200" summaryClassName="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40" summary="Coordinacion y repuestos">
          <OrderCoordinationPanel compact order={order} canManage={canManageIntake} technicians={technicians} />
        </LazyDisclosure> : null}
        {order.workflow ? <RepairAttachments orderId={order.id} /> : null}

        <LazyDisclosure className="group border-t border-slate-200"
          summaryClassName="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40 [&::-webkit-details-marker]:hidden"
          summary={<>
            <span className="flex items-center gap-2">
              <Globe2 aria-hidden="true" className="h-4 w-4" />
              Portal del cliente
            </span>
            <ChevronDown aria-hidden="true" className="h-5 w-5 transition-transform duration-200 group-open:rotate-180" />
          </>}
        >
          <RepairCustomerPortalForm
            embedded
            key={`portal-${order.id}`}
            order={order}
            returnToOrders
          />
        </LazyDisclosure>

        <div data-workshop-contact-actions="true" className={canManageIntake ? "hidden grid-cols-2 gap-2 lg:grid" : "hidden"}>
          <RepairAccessWhatsAppButton className="w-full" label="WhatsApp" order={order} size="default" />
          {phone ? (
            <a className={cn(buttonVariants({ variant: "secondary" }), "w-full")} href={`tel:${phone.replace(/\D+/g, "")}`}>
              <Phone aria-hidden="true" className="h-4 w-4" />
              Llamar
            </a>
          ) : (
            <span className={cn(buttonVariants({ variant: "ghost" }), "w-full cursor-not-allowed opacity-50")}>Sin telefono</span>
          )}
        </div>

        {canManageIntake ? (
          <div className="flex justify-end border-t border-slate-200 pt-2">
            <ActionMenu label="Mas acciones">
              <a className={buttonVariants({ variant: "secondary" })} href={`/reparaciones?rep=${encodeURIComponent(order.repairNumber)}`}>Registrar cobro</a>
              <Button className="w-full" onClick={() => onEdit(order)} type="button" variant="secondary">
                Editar ingreso
              </Button>
              <form
                action={cancelRepairAccessOrderAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Vas a anular la orden ${order.repairNumber}. Esta accion conserva el historial. Continuar?`)) {
                    event.preventDefault();
                  }
                }}
              >
                <input name="id" type="hidden" value={order.id} />
                <Button className="w-full" type="submit" variant="danger">Anular orden</Button>
              </form>
            </ActionMenu>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function WorkshopCardForm({ order, children }: { order: RepairAccessOrderRecord; children: React.ReactNode }) {
  return order.workflow ? <WorkshopForm orderId={order.id} orderVersion={order.workflow.version}>{children}</WorkshopForm> : <form action={updateRepairAccessWorkshopAction} data-workshop-form className="grid gap-4 border-t border-graphite/10 p-4">{children}</form>;
}

function WorkshopInfo({
  icon: Icon,
  label,
  value
}: {
  icon: typeof MonitorCog;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon aria-hidden="true" className="h-4 w-4" />
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="mt-1.5 break-words text-sm font-semibold leading-5 text-slate-900">{value}</p>
    </div>
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
      <div className="flex items-center gap-2 text-slate-500">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="mt-1 break-words font-medium leading-5 text-slate-800">{value}</p>
    </div>
  );
}
