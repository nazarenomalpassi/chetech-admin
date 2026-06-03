"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  repairAccessIntakeStatusOptions,
  repairAccessPriorityOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import type { RepairAccessCustomerSummary, RepairAccessOrderRecord } from "@/features/repairs-access/queries";

const wizardSteps = [
  { key: "cliente", label: "Cliente", helper: "Buscar o crear" },
  { key: "equipo", label: "Equipo", helper: "Identificacion" },
  { key: "ingreso", label: "Ingreso", helper: "Falla y orden" }
] as const;

type CustomerForm = {
  id: string;
  fullName: string;
  phone: string;
  alternatePhone: string;
  dni: string;
  email: string;
  address: string;
  notes: string;
};

function getInitialCustomer(editing: RepairAccessOrderRecord | null): CustomerForm {
  return {
    id: editing?.customer.id ?? "",
    fullName: editing?.customer.fullName ?? "",
    phone: editing?.customer.phone ?? "",
    alternatePhone: editing?.customer.alternatePhone ?? "",
    dni: editing?.customer.dni ?? "",
    email: editing?.customer.email ?? "",
    address: editing?.customer.address ?? "",
    notes: editing?.customer.notes ?? ""
  };
}

export function RepairAccessNewOrderWizard({
  customers,
  editing,
  onCancel,
  action
}: {
  customers: RepairAccessCustomerSummary[];
  editing: RepairAccessOrderRecord | null;
  onCancel: () => void;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [activeStep, setActiveStep] = useState<(typeof wizardSteps)[number]["key"]>("cliente");
  const [customerForm, setCustomerForm] = useState<CustomerForm>(() => getInitialCustomer(editing));
  const [customerLookup, setCustomerLookup] = useState("");
  const [activeLookupField, setActiveLookupField] = useState<"name" | "phone" | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<RepairAccessCustomerSummary[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

  useEffect(() => {
    setCustomerForm(getInitialCustomer(editing));
    setCustomerLookup("");
    setActiveLookupField(null);
    setActiveStep("cliente");
  }, [editing]);

  useEffect(() => {
    const query = normalizeLookup(customerLookup);
    if (query.length < 2 || !showSuggestions) {
      setRemoteSuggestions([]);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSearchingCustomers(true);
      try {
        const response = await fetch(`/api/repair-access/customers?q=${encodeURIComponent(customerLookup)}`);
        if (response.ok) {
          const payload = await response.json();
          setRemoteSuggestions(payload.customers ?? []);
        } else {
          setRemoteSuggestions([]);
        }
      } catch {
        setRemoteSuggestions([]);
      }
      setIsSearchingCustomers(false);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [customerLookup, showSuggestions]);

  const suggestions = useMemo(() => {
    const query = normalizeLookup(customerLookup);
    if (query.length < 2) return [];
    const queryTokens = query.split(" ").filter(Boolean);
    const sourceCustomers = mergeCustomers(remoteSuggestions, customers);

    return sourceCustomers
      .filter((customer) => {
        const haystack = normalizeLookup([customer.fullName, customer.phone, customer.alternatePhone, customer.dni].join(" "));
        return queryTokens.every((token) => haystack.includes(token));
      })
      .slice(0, 7);
  }, [customerLookup, customers, remoteSuggestions]);

  function updateCustomerField(field: keyof CustomerForm, value: string) {
    setCustomerForm((current) => ({ ...current, [field]: value }));
    if (field === "fullName" || field === "phone") {
      setCustomerLookup(value);
      setActiveLookupField(field === "fullName" ? "name" : "phone");
      setShowSuggestions(true);
    }
  }

  function selectCustomer(customer: RepairAccessCustomerSummary) {
    setCustomerForm({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      alternatePhone: customer.alternatePhone,
      dni: customer.dni,
      email: customer.email,
      address: customer.address,
      notes: customer.notes
    });
    setCustomerLookup("");
    setActiveLookupField(null);
    setRemoteSuggestions([]);
    setShowSuggestions(false);
  }

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Nueva orden</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            {editing ? `Editar ingreso ${editing.repairNumber}` : "Ingreso rapido de recepcion"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Esta pantalla es solo para recepcion: cliente, equipo, falla declarada y prioridad. Diagnostico, presupuesto y cobro se cargan despues en el detalle tecnico.
          </p>
        </div>
        {editing ? <Button onClick={onCancel} type="button" variant="secondary">Cancelar edicion</Button> : null}
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
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
        <input name="customerId" type="hidden" value={customerForm.id} />
        <input name="deviceId" type="hidden" value={editing?.device.id ?? ""} />

        <section className={activeStep === "cliente" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          <Field className="relative lg:col-span-3" label="Nombre completo">
            <Input
              autoComplete="off"
              name="customerName"
              onChange={(event) => updateCustomerField("fullName", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && suggestions[0]) {
                  event.preventDefault();
                  selectCustomer(suggestions[0]);
                }
              }}
              onFocus={() => {
                setCustomerLookup(customerForm.fullName);
                setActiveLookupField("name");
                setShowSuggestions(true);
              }}
              placeholder="Ej: Malpassi Nazareno"
              value={customerForm.fullName}
            />
            <CustomerSuggestions isSearching={isSearchingCustomers} onSelect={selectCustomer} show={showSuggestions && activeLookupField === "name"} suggestions={suggestions} />
          </Field>
          <Field className="relative lg:col-span-3" label="Telefono / WhatsApp">
            <Input
              autoComplete="off"
              name="customerPhone"
              onChange={(event) => updateCustomerField("phone", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && suggestions[0]) {
                  event.preventDefault();
                  selectCustomer(suggestions[0]);
                }
              }}
              onFocus={() => {
                setCustomerLookup(customerForm.phone);
                setActiveLookupField("phone");
                setShowSuggestions(true);
              }}
              placeholder="Ej: 3571 573744"
              value={customerForm.phone}
            />
            <CustomerSuggestions isSearching={isSearchingCustomers} onSelect={selectCustomer} show={showSuggestions && activeLookupField === "phone"} suggestions={suggestions} />
          </Field>
          <Field className="lg:col-span-2" label="Telefono alternativo">
            <Input name="customerAlternatePhone" onChange={(event) => updateCustomerField("alternatePhone", event.target.value)} placeholder="Opcional" value={customerForm.alternatePhone} />
          </Field>
          <Field className="lg:col-span-2" label="DNI">
            <Input name="customerDni" onChange={(event) => updateCustomerField("dni", event.target.value)} placeholder="Opcional" value={customerForm.dni} />
          </Field>
          <Field className="lg:col-span-2" label="Email">
            <Input name="customerEmail" onChange={(event) => updateCustomerField("email", event.target.value)} placeholder="Opcional" value={customerForm.email} />
          </Field>
          <Field className="lg:col-span-3" label="Direccion">
            <Input name="customerAddress" onChange={(event) => updateCustomerField("address", event.target.value)} placeholder="Domicilio o referencia" value={customerForm.address} />
          </Field>
          <Field className="lg:col-span-3" label="Observaciones del cliente">
            <Textarea name="customerNotes" onChange={(event) => updateCustomerField("notes", event.target.value)} placeholder="Notas utiles de contacto" value={customerForm.notes} />
          </Field>
          <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-500 lg:col-span-6">
            Si elegis un cliente existente, solo se copian sus datos personales. El equipo, la falla y la reparacion siempre se cargan como una orden nueva.
          </div>
        </section>

        <section className={activeStep === "equipo" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          <Field className="lg:col-span-2" label="Tipo de equipo">
            <Input defaultValue={editing?.device.deviceType ?? ""} name="deviceType" placeholder="TV, lavarropas, microondas, parlante..." />
          </Field>
          <Field className="lg:col-span-2" label="Marca">
            <Input defaultValue={editing?.device.brand ?? ""} name="deviceBrand" placeholder="Samsung, LG, Drean, Whirlpool..." />
          </Field>
          <Field className="lg:col-span-2" label="Modelo">
            <Input defaultValue={editing?.device.model ?? ""} name="deviceModel" placeholder="Modelo visible" />
          </Field>
          <Field className="lg:col-span-2" label="Numero de serie">
            <Input defaultValue={editing?.device.serialNumber ?? ""} name="serialNumber" placeholder="Opcional" />
          </Field>
          <Field className="lg:col-span-2" label="Accesorios entregados">
            <Input defaultValue={editing?.device.accessoryDetails ?? ""} name="accessoryDetails" placeholder="Control, fuente, cable, bandeja..." />
          </Field>
          <Field className="lg:col-span-2" label="Estado visual">
            <Input defaultValue={editing?.device.visualCondition ?? ""} name="visualCondition" placeholder="Golpes, faltantes, rayas, humedad..." />
          </Field>
        </section>

        <section className={activeStep === "ingreso" ? "grid gap-4 lg:grid-cols-6" : "hidden"}>
          {editing?.repairNumber ? (
            <div className="rounded-3xl bg-slate-950 p-5 text-white lg:col-span-6">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Numero de orden</p>
              <p className="mt-2 text-3xl font-semibold">{editing.repairNumber}</p>
            </div>
          ) : null}
          <Field className="lg:col-span-2" label="Fecha de ingreso">
            <Input defaultValue={editing?.intakeDate ?? new Date().toISOString().slice(0, 10)} name="intakeDate" type="date" />
          </Field>
          <Field className="lg:col-span-2" label="Prioridad">
            <Select defaultValue={editing?.priority ?? "normal"} name="priority" options={repairAccessPriorityOptions.map((option) => ({ ...option }))} />
          </Field>
          <Field className="lg:col-span-2" label="Estado inicial">
            <Select defaultValue={editing?.status ?? "pendiente_revision"} name="status" options={repairAccessIntakeStatusOptions} />
          </Field>
          <Field className="lg:col-span-6" label="Falla declarada por el cliente">
            <Textarea defaultValue={editing?.issueReported ?? ""} name="issueReported" placeholder="Ej: no enfria, no da imagen, pierde agua, no enciende..." />
          </Field>
          <Field className="lg:col-span-6" label="Observaciones internas de recepcion">
            <Textarea defaultValue={editing?.notes ?? ""} name="notes" placeholder="Condicion de ingreso, accesorios, charla con el cliente o aclaraciones" />
          </Field>
        </section>

        <div className="flex flex-col gap-3 rounded-3xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Al guardar, el sistema genera un numero REP correlativo para pegar en el equipo fisico.
          </p>
          <div className="flex flex-wrap gap-2">
            {activeStep !== "cliente" ? <Button onClick={() => setActiveStep(activeStep === "ingreso" ? "equipo" : "cliente")} type="button" variant="secondary">Anterior</Button> : null}
            {activeStep !== "ingreso" ? (
              <Button onClick={() => setActiveStep(activeStep === "cliente" ? "equipo" : "ingreso")} type="button" variant="secondary">Siguiente</Button>
            ) : null}
            {editing ? <Button onClick={onCancel} type="button" variant="secondary">Cancelar</Button> : null}
            <Button type="submit">{editing ? "Actualizar ingreso" : "Crear orden"}</Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function normalizeLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\d a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mergeCustomers(primary: RepairAccessCustomerSummary[], fallback: RepairAccessCustomerSummary[]) {
  const byId = new Map<string, RepairAccessCustomerSummary>();
  [...primary, ...fallback].forEach((customer) => byId.set(customer.id, customer));
  return Array.from(byId.values());
}

function CustomerSuggestions({
  show,
  suggestions,
  isSearching,
  onSelect
}: {
  show: boolean;
  suggestions: RepairAccessCustomerSummary[];
  isSearching: boolean;
  onSelect: (customer: RepairAccessCustomerSummary) => void;
}) {
  if (!show) return null;

  return (
    <div className="absolute left-0 right-0 top-[76px] z-20 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-soft">
      {suggestions.length ? suggestions.map((customer) => (
        <button
          className="block w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50"
          key={customer.id}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(customer);
          }}
          type="button"
        >
          <span className="block font-semibold text-slate-950">{customer.fullName}</span>
          <span className="mt-1 block text-xs text-slate-500">
            {[customer.phone, customer.dni ? `DNI ${customer.dni}` : ""].filter(Boolean).join(" - ")}
          </span>
        </button>
      )) : (
        <div className="px-4 py-3 text-sm text-slate-500">
          {isSearching ? "Buscando cliente..." : "Sin coincidencias. Podes cargarlo como cliente nuevo."}
        </div>
      )}
    </div>
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
