"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { repairAccessPaymentOptions } from "@/features/repairs-access/components/repair-access-helpers";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { repairAccessStatusValues } from "@/features/repairs-access/schemas";

const wizardSteps = [
  { key: "cliente", label: "Cliente", helper: "Buscar o crear rapido" },
  { key: "equipo", label: "Equipo", helper: "Identificacion fisica" },
  { key: "ingreso", label: "Ingreso", helper: "Falla y prioridad" },
  { key: "gestion", label: "Gestion", helper: "Estado y seguimiento" }
] as const;

export function RepairAccessNewOrderWizard({
  editing,
  onCancel,
  action
}: {
  editing: RepairAccessOrderRecord | null;
  onCancel: () => void;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [activeStep, setActiveStep] = useState<(typeof wizardSteps)[number]["key"]>("cliente");
  const statusOptions = useMemo(
    () => repairAccessStatusValues.map((status) => ({ value: status, label: status.replaceAll("_", " ") })),
    []
  );

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Nueva orden</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            {editing ? "Editar orden de service" : "Ingreso profesional por pasos"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Primero se carga lo que sabe recepcion. Diagnostico, presupuesto, reparacion y cobro quedan separados para no mezclar etapas.
          </p>
        </div>
        {editing ? <Button onClick={onCancel} type="button" variant="secondary">Salir de edicion</Button> : null}
      </div>

      <div className="grid gap-2 lg:grid-cols-4">
        {wizardSteps.map((step, index) => (
          <button
            className={`rounded-3xl border px-4 py-3 text-left transition ${activeStep === step.key ? "border-brand-300 bg-brand-50 text-brand-900" : "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
            key={step.key}
            onClick={() => setActiveStep(step.key)}
            type="button"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Paso {index + 1}</span>
            <span className="mt-1 block text-sm font-semibold">{step.label}</span>
            <span className="mt-1 block text-xs">{step.helper}</span>
          </button>
        ))}
      </div>

      <form action={action} className="space-y-6">
        <input name="id" type="hidden" value={editing?.id ?? ""} />
        <input name="customerId" type="hidden" value={editing?.customer.id ?? ""} />
        <input name="deviceId" type="hidden" value={editing?.device.id ?? ""} />

        <section className={activeStep === "cliente" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          <Field className="lg:col-span-2" label="Nombre completo">
            <Input defaultValue={editing?.customer.fullName ?? ""} key={`${editing?.id}-customer-name`} name="customerName" placeholder="Ej: Juan Perez" />
          </Field>
          <Field className="lg:col-span-2" label="Telefono / WhatsApp">
            <Input defaultValue={editing?.customer.phone ?? ""} key={`${editing?.id}-customer-phone`} name="customerPhone" placeholder="Ej: 11 5555 5555" />
          </Field>
          <Field className="lg:col-span-2" label="Telefono alternativo">
            <Input defaultValue={editing?.customer.alternatePhone ?? ""} key={`${editing?.id}-customer-alt-phone`} name="customerAlternatePhone" placeholder="Opcional" />
          </Field>
          <Field className="lg:col-span-2" label="DNI">
            <Input defaultValue={editing?.customer.dni ?? ""} key={`${editing?.id}-customer-dni`} name="customerDni" placeholder="Opcional" />
          </Field>
          <Field className="lg:col-span-2" label="Email">
            <Input defaultValue={editing?.customer.email ?? ""} key={`${editing?.id}-customer-email`} name="customerEmail" placeholder="Opcional" />
          </Field>
          <Field className="lg:col-span-2" label="Direccion">
            <Input defaultValue={editing?.customer.address ?? ""} key={`${editing?.id}-customer-address`} name="customerAddress" placeholder="Domicilio o referencia" />
          </Field>
          <Field className="lg:col-span-6" label="Observaciones del cliente">
            <Textarea defaultValue={editing?.customer.notes ?? ""} key={`${editing?.id}-customer-notes`} name="customerNotes" placeholder="Notas utiles para recepcion" />
          </Field>
        </section>

        <section className={activeStep === "equipo" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          <Field className="lg:col-span-2" label="Tipo de equipo">
            <Select
              defaultValue={editing?.device.deviceType ?? "TV"}
              key={`${editing?.id}-device-type`}
              name="deviceType"
              options={["TV", "Notebook", "PC", "Celular", "Consola", "Monitor", "Tablet", "Otro"].map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field className="lg:col-span-2" label="Marca">
            <Input defaultValue={editing?.device.brand ?? ""} key={`${editing?.id}-device-brand`} name="deviceBrand" placeholder="Samsung, LG, Lenovo..." />
          </Field>
          <Field className="lg:col-span-2" label="Modelo">
            <Input defaultValue={editing?.device.model ?? ""} key={`${editing?.id}-device-model`} name="deviceModel" placeholder="Modelo visible" />
          </Field>
          <Field className="lg:col-span-2" label="Numero de serie">
            <Input defaultValue={editing?.device.serialNumber ?? ""} key={`${editing?.id}-serial`} name="serialNumber" placeholder="Opcional" />
          </Field>
          <Field className="lg:col-span-2" label="Accesorios entregados">
            <Input defaultValue={editing?.device.accessoryDetails ?? ""} key={`${editing?.id}-accessories`} name="accessoryDetails" placeholder="Control, fuente, cable..." />
          </Field>
          <Field className="lg:col-span-2" label="Estado visual">
            <Input defaultValue={editing?.device.visualCondition ?? ""} key={`${editing?.id}-visual`} name="visualCondition" placeholder="Golpes, faltantes, pantalla..." />
          </Field>
        </section>

        <section className={activeStep === "ingreso" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          <Field className="lg:col-span-2" label="Fecha de ingreso">
            <Input defaultValue={editing?.intakeDate ?? new Date().toISOString().slice(0, 10)} key={`${editing?.id}-intake`} name="intakeDate" type="date" />
          </Field>
          <Field className="lg:col-span-2" label="Prioridad">
            <Select
              defaultValue={editing?.priority ?? "normal"}
              key={`${editing?.id}-priority`}
              name="priority"
              options={["normal", "alta", "urgente", "seguro"].map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field className="lg:col-span-2" label="Estado inicial">
            <Select defaultValue={editing?.status ?? "pendiente_revision"} key={`${editing?.id}-status`} name="status" options={statusOptions} />
          </Field>
          <Field className="lg:col-span-6" label="Falla declarada por el cliente">
            <Textarea defaultValue={editing?.issueReported ?? ""} key={`${editing?.id}-issue`} name="issueReported" placeholder="Ej: no da imagen, tiene sonido" />
          </Field>
          <Field className="lg:col-span-6" label="Observaciones internas de recepcion">
            <Textarea defaultValue={editing?.notes ?? ""} key={`${editing?.id}-notes`} name="notes" placeholder="Checklist, condicion de ingreso o aclaraciones" />
          </Field>
        </section>

        <section className={activeStep === "gestion" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          <Field className="lg:col-span-3" label="Diagnostico tecnico">
            <Textarea defaultValue={editing?.technicalDiagnosis ?? ""} key={`${editing?.id}-diagnosis`} name="technicalDiagnosis" placeholder="Lo carga el tecnico cuando revise" />
          </Field>
          <Field className="lg:col-span-3" label="Observaciones internas tecnicas">
            <Textarea defaultValue={editing?.internalObservations ?? ""} key={`${editing?.id}-internal`} name="internalObservations" placeholder="Notas internas" />
          </Field>
          <Field className="lg:col-span-2" label="Presupuesto">
            <Input defaultValue={editing?.budgetAmount ?? 0} key={`${editing?.id}-budget`} min={0} name="budgetAmount" step="0.01" type="number" />
          </Field>
          <Field className="lg:col-span-2" label="Aprobado">
            <Input defaultValue={editing?.approvedAmount ?? 0} key={`${editing?.id}-approved`} min={0} name="approvedAmount" step="0.01" type="number" />
          </Field>
          <Field className="lg:col-span-2" label="Final">
            <Input defaultValue={editing?.finalAmount ?? 0} key={`${editing?.id}-final`} min={0} name="finalAmount" step="0.01" type="number" />
          </Field>
          <Field className="lg:col-span-2" label="Medio de pago">
            <Select
              defaultValue={editing?.paymentMethod ?? "efectivo"}
              key={`${editing?.id}-payment-method`}
              name="paymentMethod"
              options={repairAccessPaymentOptions.map((method) => ({ value: method.value, label: method.label }))}
            />
          </Field>
          <Field className="lg:col-span-2" label="Garantia dias">
            <Input defaultValue={editing?.warrantyDays ?? 0} key={`${editing?.id}-warranty-days`} min={0} name="warrantyDays" type="number" />
          </Field>
          <Field className="lg:col-span-2" label="Garantia hasta">
            <Input defaultValue={editing?.warrantyUntil ?? ""} key={`${editing?.id}-warranty`} name="warrantyUntil" type="date" />
          </Field>
          <Field className="lg:col-span-2" label="Trabajo realizado">
            <Textarea defaultValue={editing?.workPerformed ?? ""} key={`${editing?.id}-work`} name="workPerformed" placeholder="Trabajo realizado" />
          </Field>
          <Field className="lg:col-span-2" label="Repuestos usados">
            <Textarea defaultValue={editing?.usedParts ?? ""} key={`${editing?.id}-parts`} name="usedParts" placeholder="Repuestos o insumos" />
          </Field>
          <Field className="lg:col-span-2" label="Condiciones garantia">
            <Textarea defaultValue={editing?.warrantyConditions ?? ""} key={`${editing?.id}-warranty-conditions`} name="warrantyConditions" placeholder="Condiciones" />
          </Field>
          <Field className="lg:col-span-4" label="Notas de cobro">
            <Input defaultValue={editing?.paymentNotes ?? ""} key={`${editing?.id}-payment-notes`} name="paymentNotes" placeholder="Senia, saldo o acuerdo" />
          </Field>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 lg:col-span-2">
            <input defaultChecked={editing?.isPaid ?? false} key={`${editing?.id}-is-paid`} name="isPaid" type="checkbox" />
            Marcar como cobrada
          </label>
        </section>

        <div className="flex flex-col gap-3 rounded-3xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Guardar crea o actualiza cliente, equipo y orden. Todavia no impacta caja automaticamente.
          </p>
          <div className="flex gap-2">
            {editing ? <Button onClick={onCancel} type="button" variant="secondary">Cancelar</Button> : null}
            <Button type="submit">{editing ? "Actualizar orden" : "Crear orden"}</Button>
          </div>
        </div>
      </form>
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
