"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { DraftRecoveryBanner } from "@/components/forms/draft-recovery-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateRepairAccessTechnicalAction } from "@/features/repairs-access/actions";
import {
  getRepairAccessPaymentLabel,
  repairAccessPaymentOptions,
  repairAccessStatusOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairCustomerLinkCard } from "@/features/repairs-access/components/repair-customer-link-card";
import { RepairCustomerPortalForm } from "@/features/repairs-access/components/repair-customer-portal-form";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import { RepairAccessWarrantyBadge } from "@/features/repairs-access/components/repair-access-warranty-badge";
import { RepairAccessWhatsAppPanel } from "@/features/repairs-access/components/repair-access-whatsapp-actions";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { shouldCaptureRepairDraftOnInput } from "@/features/repairs-access/technical-form-events";
import {
  getOperationalDate,
  getWarrantyState,
  toWarrantyDateOnly
} from "@/features/repairs-access/warranty";
import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderCoordinationPanel, type WorkshopTechnician } from "./order-coordination-panel";
import { TECHNICAL_WORKSHOP_STATUSES } from "../workflow";
import { RepairAttachments } from "./repair-attachments";
import { ReadyForPickupRequirements } from "./ready-for-pickup-requirements";
import { RepairQuickEditor } from "./repair-quick-editor";

export function RepairAccessOrderDetail({
  order,
  technicians,
  onBack,
  onEditIntake,
  defaultWarrantyDays
}: {
  order: RepairAccessOrderRecord;
  technicians?: WorkshopTechnician[];
  onBack: () => void;
  onEditIntake: (order: RepairAccessOrderRecord) => void;
  defaultWarrantyDays: number;
}) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");
  const visibleAmount = order.finalAmount || order.budgetAmount;
  const [status, setStatus] = useState(order.status);
  const [budgetAmount, setBudgetAmount] = useState(String(order.budgetAmount || ""));
  const [finalAmount, setFinalAmount] = useState(String(order.finalAmount || visibleAmount || ""));
  const [budgetDetail, setBudgetDetail] = useState(order.budgetDetail ?? "");
  const [hasWarranty, setHasWarranty] = useState(order.hasWarranty);
  const [warrantyDays, setWarrantyDays] = useState(
    String(order.warrantyDays || defaultWarrantyDays)
  );
  const [pickedUpAt, setPickedUpAt] = useState(toWarrantyDateOnly(order.pickedUpAt) ?? "");
  const [finalAmountWasEdited, setFinalAmountWasEdited] = useState(Boolean(order.finalAmount));
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [restoredFields, setRestoredFields] = useState<Record<string, string>>({});
  const [formRevision, setFormRevision] = useState(0);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    const nextVisibleAmount = order.finalAmount || order.budgetAmount;
    setStatus(order.status);
    setBudgetAmount(String(order.budgetAmount || ""));
    setFinalAmount(String(order.finalAmount || nextVisibleAmount || ""));
    setBudgetDetail(order.budgetDetail ?? "");
    setHasWarranty(order.hasWarranty);
    setWarrantyDays(String(order.warrantyDays || defaultWarrantyDays));
    setPickedUpAt(toWarrantyDateOnly(order.pickedUpAt) ?? "");
    setFinalAmountWasEdited(Boolean(order.finalAmount));
    setDraftFields({});
    setRestoredFields({});
    setFormRevision((current) => current + 1);
  }, [
    defaultWarrantyDays,
    order.id,
    order.status,
    order.budgetAmount,
    order.finalAmount,
    order.budgetDetail,
    order.hasWarranty,
    order.pickedUpAt,
    order.warrantyDays
  ]);

  const hasUnsavedChanges = Object.entries(draftFields).some(
    ([key, value]) => key !== "id" && value.trim().length > 0
  );
  const restoreDraft = useCallback((fields: Record<string, string>) => {
    setRestoredFields(fields);
    setDraftFields(fields);
    setStatus(fields.status || order.status);
    setBudgetAmount(fields.budgetAmount ?? "");
    setFinalAmount(fields.finalAmount ?? "");
    setBudgetDetail(fields.budgetDetail ?? "");
    setHasWarranty(fields.hasWarranty === "on");
    setWarrantyDays(fields.warrantyDays ?? String(order.warrantyDays || defaultWarrantyDays));
    setPickedUpAt(fields.pickedUpAt ?? toWarrantyDateOnly(order.pickedUpAt) ?? "");
    setFinalAmountWasEdited(Boolean(fields.finalAmount));
    setFormRevision((current) => current + 1);
  }, [defaultWarrantyDays, order.pickedUpAt, order.status, order.warrantyDays]);
  const draft = usePersistentFormDraft<Record<string, string>>({
    draftKey: `repair-access:technical:${order.id}`,
    isDirty: hasUnsavedChanges,
    onRestore: restoreDraft,
    value: draftFields
  });

  function captureDraft(event: FormEvent<HTMLFormElement>) {
    const values: Record<string, string> = {};
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") values[key] = value;
    });
    setDraftFields(values);
  }

  function captureInputDraft(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (!shouldCaptureRepairDraftOnInput(target.tagName, target.type)) return;

    captureDraft(event);
  }

  function restoredValue(name: string, fallback = "") {
    return restoredFields[name] ?? fallback;
  }

  function confirmSectionChange(action: () => void) {
    if (
      (hasUnsavedChanges || document.documentElement.hasAttribute("data-unsaved-changes")) &&
      !window.confirm("Hay cambios técnicos sin guardar. El borrador quedará disponible para recuperarlo. ¿Querés continuar?")
    ) {
      return;
    }
    action();
  }

  function handleBudgetAmountChange(value: string) {
    setBudgetAmount(value);
    if (!finalAmountWasEdited || !finalAmount || finalAmount === "0") {
      setFinalAmount(value);
    }
  }

  function handleStatusChange(nextStatus: string) {
    setStatus(nextStatus);
    if (nextStatus === "retirado" && !pickedUpAt) {
      setPickedUpAt(getOperationalDate());
    }
  }

  function toNumber(value: string) {
    return Number(value.replace(",", ".")) || 0;
  }

  const liveOrder = {
    ...order,
    status,
    budgetAmount: toNumber(budgetAmount),
    finalAmount: toNumber(finalAmount),
    budgetDetail,
    warrantyDays: toNumber(warrantyDays)
  };
  const liveWarranty = getWarrantyState({
    hasWarranty,
    warrantyDays: toNumber(warrantyDays),
    pickedUpAt: pickedUpAt || null,
    repairStatus: status,
    requiresReview: order.warrantyRequiresReview && !pickedUpAt
  });

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-white">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Seguimiento tecnico</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-slate-950">{order.repairNumber}</h1>
              <RepairAccessStatusBadge status={status} />
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {order.customer.fullName} - {order.customer.phone || "sin telefono"} - {deviceLabel || "Equipo"} - ingreso {formatDate(order.intakeDate)}
            </p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button className="w-full sm:w-auto" onClick={() => confirmSectionChange(onBack)} type="button" variant="secondary">Volver a ordenes</Button>
            <Button className="w-full sm:w-auto" onClick={() => confirmSectionChange(() => onEditIntake(order))} type="button" variant="secondary">Editar ingreso</Button>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <HeaderMetric label="Presupuesto" value={formatCurrency(liveOrder.budgetAmount)} />
          <HeaderMetric label="Total final" value={formatCurrency(liveOrder.finalAmount)} />
          <HeaderMetric label="Medio" value={getRepairAccessPaymentLabel(order.paymentMethod)} />
          <HeaderMetric label="Cobro en ficha" value={order.isPaid ? "Informado" : "Sin informar"} />
          <div className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Garantia</p>
            <div className="mt-2">
              <RepairAccessWarrantyBadge showDetail warranty={liveWarranty} />
            </div>
          </div>
        </div>

        <RepairAccessWhatsAppPanel order={liveOrder} />
      </Card>

      {order.workflow ? <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Actualizar trabajo</h2>
            <p className="mt-1 text-sm text-slate-500">Presupuesto, avance y estado en un solo guardado.</p>
          </div>
          <Button type="button" variant="secondary" className="min-h-11" aria-expanded={advanced}
            onClick={() => confirmSectionChange(() => setAdvanced(!advanced))}>
            {advanced ? "Volver al editor simple" : "Mas campos administrativos"}
          </Button>
        </div>
        {!advanced ? <RepairQuickEditor order={order} canManage /> : <p className="mt-3 text-sm text-slate-500">El formulario administrativo esta debajo de los datos del equipo.</p>}
      </Card> : null}
      <OrderCoordinationPanel order={order} canManage technicians={technicians} />
      {order.workflow ? <RepairAttachments orderId={order.id} /> : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <InfoBlock
            title="Cliente"
            rows={[
              ["Nombre", order.customer.fullName],
              ["Telefono", order.customer.phone],
              ["Telefono alt.", order.customer.alternatePhone],
              ["DNI", order.customer.dni],
              ["Email", order.customer.email],
              ["Direccion", order.customer.address],
              ["Observaciones", order.customer.notes]
            ]}
          />
          <RepairCustomerLinkCard
            linkedCustomer={order.storefrontCustomer}
            orderId={order.id}
          />
          <InfoBlock
            title="Equipo"
            rows={[
              ["Tipo", order.device.deviceType],
              ["Marca", order.device.brand],
              ["Modelo", order.device.model],
              ["Serie", order.device.serialNumber],
              ["Accesorios", order.device.accessoryDetails],
              ["Estado visual", order.device.visualCondition]
            ]}
          />
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Retiro y garantia
            </p>
            <div className="mt-3">
              <RepairAccessWarrantyBadge showDetail warranty={liveWarranty} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <WarrantyInfoRow
                label="Retiro efectivo"
                value={pickedUpAt ? formatDate(pickedUpAt) : "Sin fecha registrada"}
              />
              <WarrantyInfoRow
                label="Inicio"
                value={liveWarranty.startsOn ? formatDate(liveWarranty.startsOn) : "-"}
              />
              <WarrantyInfoRow
                label="Vencimiento"
                value={liveWarranty.expiresOn ? formatDate(liveWarranty.expiresOn) : "-"}
              />
              <WarrantyInfoRow
                label="Plazo asignado"
                value={hasWarranty ? `${toNumber(warrantyDays)} dias` : "Sin garantia"}
              />
              {order.legacyOrderNumber ? (
                <WarrantyInfoRow
                  label="Orden historica"
                  value={order.legacyOrderNumber}
                />
              ) : null}
            </div>
            {order.warrantyConditions ? (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {order.warrantyConditions}
              </p>
            ) : null}
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Recepcion</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Falla declarada</h2>
            <p className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{order.issueReported}</p>
            {order.notes ? <p className="mt-3 text-sm leading-6 text-slate-500">{order.notes}</p> : null}
          </Card>
        </div>

        {!order.workflow || advanced ? <Card>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Zona tecnica</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Diagnostico, presupuesto y cierre</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Aca trabaja tecnico/administracion despues del ingreso. Nada de esto se pide en la creacion inicial.
            </p>
            <p className="mt-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900">
              Presupuesto, avance de reparación y detalle del presupuesto se publican
              automáticamente en la cuenta vinculada del cliente. El resto de la ficha continúa
              siendo interno.
            </p>
          </div>

          {draft.pendingDraft ? (
            <div className="mt-6">
              <DraftRecoveryBanner
                onDiscard={draft.discardDraft}
                onRestore={draft.restoreDraft}
                updatedAt={draft.pendingDraft.updatedAt}
              />
            </div>
          ) : null}

          <form
            action={updateRepairAccessTechnicalAction}
            data-workshop-form
            className="mt-6 grid gap-4 lg:grid-cols-6"
            key={formRevision}
            onChange={captureDraft}
            onInput={captureInputDraft}
          >
            <input name="id" type="hidden" value={order.id} />
            {order.workflow ? <input name="expectedVersion" type="hidden" value={order.workflow.version} /> : null}

            <div className="lg:col-span-6"><ReadyForPickupRequirements workflow={order.workflow} status={order.status} canManage /></div>

            <Field className="lg:col-span-2" label="Estado actual">
              <Select
                name="status"
                onChange={(event) => handleStatusChange(event.target.value)}
                options={repairAccessStatusOptions.filter((option) => !order.workflow || TECHNICAL_WORKSHOP_STATUSES.includes(option.value) || option.value === order.status)}
                value={status}
              />
            </Field>
            <Field className="lg:col-span-2" label="Presupuesto · visible para el cliente">
              <Input min={0} name="budgetAmount" onChange={(event) => handleBudgetAmountChange(event.target.value)} step="0.01" type="number" value={budgetAmount} />
            </Field>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 lg:col-span-2">
              <input
                checked={status === "sin_solucion"}
                onChange={(event) => setStatus(event.target.checked ? "sin_solucion" : "en_revision")}
                type="checkbox"
              />
              No tiene reparacion
            </label>

            <Field className="lg:col-span-3" label="Avance de reparacion · visible para el cliente">
              <Textarea
                defaultValue={restoredValue("repairProgress", order.repairProgress ?? "")}
                maxLength={2000}
                name="repairProgress"
                placeholder="Que se reviso, que falta o en que estado esta"
              />
            </Field>

            <Field className="lg:col-span-3" label="Detalle del presupuesto · visible para el cliente">
              <Textarea
                maxLength={2000}
                name="budgetDetail"
                onChange={(event) => setBudgetDetail(event.target.value)}
                placeholder="Detalle para enviar al cliente por WhatsApp"
                value={budgetDetail}
              />
            </Field>

            <Field className="lg:col-span-6" label="Respuesta del cliente / comentario de estado">
              <Textarea defaultValue={restoredValue("budgetResponseNotes", order.budgetResponseNotes ?? "")} name="budgetResponseNotes" readOnly={Boolean(order.workflow)} placeholder="La respuesta del cliente se registra desde los botones de confirmacion." />
            </Field>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm lg:col-span-6"><input className="mt-1" type="checkbox" name="qualityChecked" defaultChecked={Boolean(order.workflow?.qualityCheckedAt)} />Verifique la falla reparada, el funcionamiento y los accesorios antes de marcar listo para retirar.</label>
            <Field className="lg:col-span-6" label="Resultado del control de calidad"><Textarea name="qualityNotes" defaultValue={order.workflow?.qualityNotes || ""} maxLength={2000} /></Field>

            <div className="rounded-3xl bg-slate-50 p-4 lg:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Ficha de cobro informativa y garantia</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Estos datos no impactan caja ni balances. El movimiento real de plata se registra en Pagos de reparaciones usando el numero de orden.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-6">
                <Field className="lg:col-span-2" label="Total final">
                  <Input
                    min={0}
                    name="finalAmount"
                    onChange={(event) => {
                      setFinalAmountWasEdited(true);
                      setFinalAmount(event.target.value);
                    }}
                    step="0.01"
                    type="number"
                    value={finalAmount}
                  />
                </Field>
                <Field className="lg:col-span-2" label="Medio de pago">
                  <Select disabled={Boolean(order.workflow)} defaultValue={restoredValue("paymentMethod", order.paymentMethod || "")} name="paymentMethod" options={[{ value: "", label: "Sin seleccionar" }, ...repairAccessPaymentOptions.map((method) => ({ value: method.value, label: method.label }))]} />
                </Field>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 lg:col-span-2">
                  <input disabled={Boolean(order.workflow)} defaultChecked={restoredFields.isPaid === "on" || (!("isPaid" in restoredFields) && order.isPaid)} name="isPaid" type="checkbox" />
                  {order.workflow ? "Cobro registrado desde Pagos" : "Registrar cobro informado en ficha"}
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 lg:col-span-2">
                  <input
                    checked={hasWarranty}
                    name="hasWarranty"
                    onChange={(event) => {
                      setHasWarranty(event.target.checked);
                      if (event.target.checked && toNumber(warrantyDays) <= 0) {
                        setWarrantyDays(String(defaultWarrantyDays));
                      }
                    }}
                    type="checkbox"
                  />
                  Esta reparacion tiene garantia
                </label>
                <Field className="lg:col-span-2" label="Duracion de garantia en dias">
                  <Input
                    disabled={!hasWarranty}
                    min={0}
                    name="warrantyDays"
                    onChange={(event) => setWarrantyDays(event.target.value)}
                    step={1}
                    type="number"
                    value={warrantyDays}
                  />
                </Field>
                <Field className="lg:col-span-2" label="Fecha efectiva de retiro">
                  <Input
                    aria-describedby="pickup-date-help"
                    name="pickedUpAt"
                    readOnly={Boolean(order.workflow)}
                    onChange={(event) => setPickedUpAt(event.target.value)}
                    required={status === "retirado"}
                    type="date"
                    value={pickedUpAt}
                  />
                </Field>
                <p className="text-xs leading-5 text-slate-500 lg:col-span-6" id="pickup-date-help">
                  La garantia empieza en esta fecha, nunca al ingresar, presupuestar o terminar el
                  equipo. Al pasar una orden a Retirado se propone automaticamente la fecha de hoy.
                </p>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Estado de garantia</span>
                  <div className="mt-2">
                    <RepairAccessWarrantyBadge showDetail warranty={liveWarranty} />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Inicio garantia</span>
                  <span className="mt-1 block text-slate-800">
                    {liveWarranty.startsOn ? formatDate(liveWarranty.startsOn) : "Pendiente de retiro"}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Garantia hasta</span>
                  <span className="mt-1 block text-slate-800">
                    {liveWarranty.expiresOn ? formatDate(liveWarranty.expiresOn) : "Todavia no comenzo"}
                  </span>
                </div>
                <Field className="lg:col-span-3" label="Notas de cobro">
                  <Input defaultValue={restoredValue("paymentNotes", order.paymentNotes ?? "")} name="paymentNotes" placeholder="Senia, saldo o acuerdo" />
                </Field>
                <Field className="lg:col-span-3" label="Condiciones especiales de garantia">
                  <Textarea defaultValue={restoredValue("warrantyConditions", order.warrantyConditions ?? "")} name="warrantyConditions" placeholder="Condiciones de garantia entregadas al cliente" />
                </Field>
              </div>
            </div>

            <div className="flex justify-end lg:col-span-6">
              <FormSubmitButton
                className="w-full sm:w-auto"
                idleLabel="Guardar seguimiento técnico"
                pendingLabel="Guardando seguimiento..."
              />
            </div>
            {draft.lastSavedAt && hasUnsavedChanges ? (
              <p aria-live="polite" className="text-right text-xs text-slate-500 lg:col-span-6">
                Borrador técnico guardado en este dispositivo.
              </p>
            ) : null}
          </form>
        </Card> : null}
      </div>

      <RepairCustomerPortalForm key={`portal-${order.id}`} order={order} />
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function WarrantyInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

function InfoBlock({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:gap-3" key={label}>
            <span className="shrink-0 text-slate-400 sm:w-32">{label}</span>
            <span className="min-w-0 break-words text-slate-700">{value || "-"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
