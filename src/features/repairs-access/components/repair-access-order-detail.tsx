"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateRepairAccessTechnicalAction } from "@/features/repairs-access/actions";
import {
  getRepairAccessPaymentLabel,
  repairAccessPaymentOptions,
  repairAccessStatusOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import { RepairAccessWhatsAppPanel } from "@/features/repairs-access/components/repair-access-whatsapp-actions";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairAccessOrderDetail({
  order,
  onBack,
  onEditIntake
}: {
  order: RepairAccessOrderRecord;
  onBack: () => void;
  onEditIntake: (order: RepairAccessOrderRecord) => void;
}) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - ");
  const visibleAmount = order.finalAmount || order.budgetAmount;
  const [status, setStatus] = useState(order.status);
  const [budgetAmount, setBudgetAmount] = useState(String(order.budgetAmount || ""));
  const [finalAmount, setFinalAmount] = useState(String(order.finalAmount || visibleAmount || ""));
  const [budgetDetail, setBudgetDetail] = useState(order.budgetDetail ?? "");
  const [warrantyDays, setWarrantyDays] = useState(String(order.warrantyDays || ""));
  const [finalAmountWasEdited, setFinalAmountWasEdited] = useState(Boolean(order.finalAmount));

  useEffect(() => {
    const nextVisibleAmount = order.finalAmount || order.budgetAmount;
    setStatus(order.status);
    setBudgetAmount(String(order.budgetAmount || ""));
    setFinalAmount(String(order.finalAmount || nextVisibleAmount || ""));
    setBudgetDetail(order.budgetDetail ?? "");
    setWarrantyDays(String(order.warrantyDays || ""));
    setFinalAmountWasEdited(Boolean(order.finalAmount));
  }, [order.id, order.status, order.budgetAmount, order.finalAmount, order.budgetDetail, order.warrantyDays]);

  function handleBudgetAmountChange(value: string) {
    setBudgetAmount(value);
    if (!finalAmountWasEdited || !finalAmount || finalAmount === "0") {
      setFinalAmount(value);
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

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.14),transparent_34%),linear-gradient(135deg,#ffffff,#f8fbf9)]">
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={onBack} type="button" variant="secondary">Volver a ordenes</Button>
            <Button onClick={() => onEditIntake(order)} type="button" variant="secondary">Editar ingreso</Button>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeaderMetric label="Presupuesto" value={formatCurrency(liveOrder.budgetAmount)} />
          <HeaderMetric label="Total final" value={formatCurrency(liveOrder.finalAmount)} />
          <HeaderMetric label="Medio" value={getRepairAccessPaymentLabel(order.paymentMethod)} />
          <HeaderMetric label="Cobro en ficha" value={order.isPaid ? "Informado" : "Sin informar"} />
        </div>

        <RepairAccessWhatsAppPanel order={liveOrder} />
      </Card>

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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Recepcion</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Falla declarada</h2>
            <p className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{order.issueReported}</p>
            {order.notes ? <p className="mt-3 text-sm leading-6 text-slate-500">{order.notes}</p> : null}
          </Card>
        </div>

        <Card>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Zona tecnica</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Diagnostico, presupuesto y cierre</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Aca trabaja tecnico/administracion despues del ingreso. Nada de esto se pide en la creacion inicial.
            </p>
          </div>

          <form action={updateRepairAccessTechnicalAction} className="mt-6 grid gap-4 lg:grid-cols-6">
            <input name="id" type="hidden" value={order.id} />

            <Field className="lg:col-span-2" label="Estado actual">
              <Select
                name="status"
                onChange={(event) => setStatus(event.target.value)}
                options={repairAccessStatusOptions}
                value={status}
              />
            </Field>
            <Field className="lg:col-span-2" label="Presupuesto">
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

            <Field className="lg:col-span-3" label="Avance de reparacion">
              <Textarea defaultValue={order.repairProgress ?? ""} name="repairProgress" placeholder="Que se reviso, que falta o en que estado esta" />
            </Field>

            <Field className="lg:col-span-3" label="Detalle del presupuesto">
              <Textarea
                name="budgetDetail"
                onChange={(event) => setBudgetDetail(event.target.value)}
                placeholder="Detalle para enviar al cliente por WhatsApp"
                value={budgetDetail}
              />
            </Field>

            <Field className="lg:col-span-6" label="Respuesta del cliente / comentario de estado">
              <Textarea defaultValue={order.budgetResponseNotes ?? ""} name="budgetResponseNotes" placeholder="Acepta, rechaza, consulta, se aviso por WhatsApp, etc." />
            </Field>

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
                  <Select defaultValue={order.paymentMethod || ""} name="paymentMethod" options={[{ value: "", label: "Sin seleccionar" }, ...repairAccessPaymentOptions.map((method) => ({ value: method.value, label: method.label }))]} />
                </Field>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 lg:col-span-2">
                  <input defaultChecked={order.isPaid} name="isPaid" type="checkbox" />
                  Registrar cobro informado en ficha
                </label>
                <Field className="lg:col-span-2" label="Garantia en dias">
                  <Input
                    min={0}
                    name="warrantyDays"
                    onChange={(event) => setWarrantyDays(event.target.value)}
                    type="number"
                    value={warrantyDays}
                  />
                </Field>
                <Field className="lg:col-span-2" label="Notas de cobro">
                  <Input defaultValue={order.paymentNotes ?? ""} name="paymentNotes" placeholder="Senia, saldo o acuerdo" />
                </Field>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Inicio garantia</span>
                  <span className="mt-1 block text-slate-800">{order.warrantyStart ? formatDate(order.warrantyStart) : "Arranca al facturar en Pagos de reparaciones"}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Garantia hasta</span>
                  <span className="mt-1 block text-slate-800">{order.warrantyUntil ? formatDate(order.warrantyUntil) : "Pendiente de retiro/facturacion"}</span>
                </div>
                <Field className="lg:col-span-6" label="Condiciones de garantia">
                  <Textarea defaultValue={order.warrantyConditions ?? ""} name="warrantyConditions" placeholder="Condiciones de garantia entregadas al cliente" />
                </Field>
              </div>
            </div>

            <div className="flex justify-end lg:col-span-6">
              <Button type="submit">Guardar seguimiento tecnico</Button>
            </div>
          </form>
        </Card>
      </div>
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

function InfoBlock({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <div className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm" key={label}>
            <span className="w-32 shrink-0 text-slate-400">{label}</span>
            <span className="text-slate-700">{value || "-"}</span>
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
