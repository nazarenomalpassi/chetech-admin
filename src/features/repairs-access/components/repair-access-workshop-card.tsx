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
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export function RepairAccessWorkshopCard({
  order,
  canManageIntake,
  onEdit,
  onOpenDetail
}: {
  order: RepairAccessOrderRecord;
  canManageIntake: boolean;
  onEdit: (order: RepairAccessOrderRecord) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");
  const phone = order.customer.phone || order.customer.alternatePhone;
  const repairAmount = order.finalAmount || order.budgetAmount;

  return (
    <article className="min-w-0 overflow-hidden rounded-[28px] border border-graphite/12 bg-[#fbfaf6] shadow-panel">
      <header className="grid min-w-0 gap-3 border-b border-graphite/10 px-4 pb-4 pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-5">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Numero de orden</p>
          {canManageIntake ? (
            <button
              aria-label={`Abrir orden ${order.repairNumber}`}
              className="mt-1 block w-full whitespace-normal break-words text-left text-[1.8rem] font-bold leading-tight tracking-[-0.045em] text-slate-950 [overflow-wrap:anywhere] hover:text-brand-700"
              onClick={() => onOpenDetail(order)}
              type="button"
            >
              {order.repairNumber}
            </button>
          ) : (
            <p className="mt-1 block w-full whitespace-normal break-words text-[1.8rem] font-bold leading-tight tracking-[-0.045em] text-slate-950 [overflow-wrap:anywhere]">
              {order.repairNumber}
            </p>
          )}
        </div>
        <div className="flex max-w-full flex-wrap items-start gap-2 sm:justify-end">
          <RepairAccessStatusBadge status={order.status} />
          <RepairAccessWarrantyBadge warranty={order.warranty} />
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <section className="rounded-[22px] bg-graphite px-4 py-4 text-white">
          <div className="flex items-center gap-2 text-white/60">
            <Wrench aria-hidden="true" className="h-4 w-4" />
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Falla reportada</p>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-base font-semibold leading-6 text-white">
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

        <LazyDisclosure className="group overflow-hidden rounded-[22px] border border-graphite/12 bg-white"
          summaryClassName="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-slate-950 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite/25 [&::-webkit-details-marker]:hidden"
          summary={<>
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-graphite text-white">
                <ClipboardPenLine aria-hidden="true" className="h-4 w-4" />
              </span>
              Actualizar trabajo
            </span>
            <ChevronDown aria-hidden="true" className="h-5 w-5 transition-transform duration-200 group-open:rotate-180" />
          </>}
        >

          <form action={updateRepairAccessWorkshopAction} className="grid gap-4 border-t border-graphite/10 p-4">
            <input name="id" type="hidden" value={order.id} />

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Estado de la orden</span>
              <Select defaultValue={order.status} id={`workshop-${order.id}-status`} name="status" options={repairAccessStatusOptions} />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Presupuesto · visible para el cliente</span>
              <Input
                defaultValue={repairAmount ? String(repairAmount) : ""}
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
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Detalle del presupuesto · visible para el cliente</span>
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
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Avance de reparacion · visible para el cliente</span>
              <Textarea
                className="min-h-24"
                defaultValue={order.repairProgress ?? ""}
                maxLength={2000}
                name="repairProgress"
                id={`workshop-${order.id}-progress`}
                placeholder="Que se reviso, que se hizo y que falta"
              />
            </label>

            <FormSubmitButton
              className="min-h-12 w-full"
              idleLabel="Guardar actualizacion"
              pendingLabel="Guardando cambios..."
            />
          </form>
        </LazyDisclosure>

        <LazyDisclosure className="group overflow-hidden rounded-[22px] border border-graphite/12 bg-white"
          summaryClassName="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-slate-950 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite/25 [&::-webkit-details-marker]:hidden"
          summary={<>
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Globe2 aria-hidden="true" className="h-4 w-4" />
              </span>
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

        <div data-workshop-contact-actions="true" className="hidden grid-cols-2 gap-2 lg:grid">
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
          <details className="group rounded-[20px] border border-dashed border-graphite/12">
            <summary className="cursor-pointer list-none px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 [&::-webkit-details-marker]:hidden">
              Acciones administrativas
            </summary>
            <div className="grid grid-cols-2 gap-2 border-t border-graphite/8 p-3">
              <Button className="w-full" onClick={() => onOpenDetail(order)} type="button" variant="secondary">
                Ficha completa
              </Button>
              <Button className="w-full" onClick={() => onEdit(order)} type="button" variant="secondary">
                Editar ingreso
              </Button>
              <form
                className="col-span-2"
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
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
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
      <div className="flex items-center gap-2 text-slate-400">
        <Icon aria-hidden="true" className="h-4 w-4" />
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em]">{label}</p>
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
      <div className="flex items-center gap-2 text-slate-400">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-1 break-words font-semibold leading-5 text-slate-800">{value}</p>
    </div>
  );
}
