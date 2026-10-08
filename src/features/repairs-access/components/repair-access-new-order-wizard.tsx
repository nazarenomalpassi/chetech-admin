"use client";

import type { FocusEvent, FocusEventHandler, FormEvent, KeyboardEvent, KeyboardEventHandler, ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { DraftRecoveryBanner } from "@/components/forms/draft-recovery-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  repairAccessIntakeStatusOptions,
  repairAccessPriorityOptions
} from "@/features/repairs-access/components/repair-access-helpers";
import type { RepairAccessCustomerSummary, RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";
import { getLocalDateInputValue } from "@/lib/utils";

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

type RepairIntakeDraft = {
  fields: Record<string, string>;
};

const meaningfulIntakeFields = [
  "customerName",
  "customerPhone",
  "customerAlternatePhone",
  "customerDni",
  "customerEmail",
  "customerAddress",
  "customerNotes",
  "deviceType",
  "deviceBrand",
  "deviceModel",
  "serialNumber",
  "accessoryDetails",
  "deviceColor",
  "visualCondition",
  "issueReported",
  "notes"
] as const;

function readFormValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") values[key] = value;
  });
  return values;
}

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
  action,
  onDirtyChange
}: {
  customers: RepairAccessCustomerSummary[];
  editing: RepairAccessOrderRecord | null;
  onCancel: () => void;
  action: (formData: FormData) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const editingIdRef = useRef(editing?.id ?? null);
  const suggestionsId = useId();
  const [customerForm, setCustomerForm] = useState<CustomerForm>(() => getInitialCustomer(editing));
  const [customerLookup, setCustomerLookup] = useState("");
  const [activeLookupField, setActiveLookupField] = useState<"name" | "phone" | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionCustomerId, setActiveSuggestionCustomerId] = useState<string | null>(null);
  const [remoteSuggestions, setRemoteSuggestions] = useState<RepairAccessCustomerSummary[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [restoredFields, setRestoredFields] = useState<Record<string, string>>({});
  const [formRevision, setFormRevision] = useState(0);

  useEffect(() => {
    const editingId = editing?.id ?? null;
    if (editingIdRef.current === editingId) return;
    editingIdRef.current = editingId;
    setCustomerForm(getInitialCustomer(editing));
    setCustomerLookup("");
    setActiveLookupField(null);
    setShowSuggestions(false);
    setActiveSuggestionCustomerId(null);
    setRemoteSuggestions([]);
    setDraftFields({});
    setRestoredFields({});
    setFormRevision((current) => current + 1);
  }, [editing]);

  useEffect(() => {
    const query = normalizeLookup(customerLookup);
    setRemoteSuggestions([]);
    setIsSearchingCustomers(false);
    if (query.length < 2 || !showSuggestions) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingCustomers(true);
      try {
        const response = await fetch(`/api/repair-access/customers?q=${encodeURIComponent(customerLookup)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.ok) {
          const payload = await response.json();
          if (controller.signal.aborted) return;
          setRemoteSuggestions(payload.customers ?? []);
        } else {
          setRemoteSuggestions([]);
        }
      } catch {
        if (!controller.signal.aborted) setRemoteSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingCustomers(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
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

  const suggestionsVisible = showSuggestions && normalizeLookup(customerLookup).length >= 2;
  const selectedSuggestionIndex = suggestions.findIndex((customer) => customer.id === activeSuggestionCustomerId);
  const activeSuggestionId = selectedSuggestionIndex >= 0 ? `${suggestionsId}-${suggestions[selectedSuggestionIndex].id}` : undefined;

  const hasUnsavedChanges = meaningfulIntakeFields.some((field) => (draftFields[field] ?? "").trim().length > 0);
  const restoreDraft = useCallback((draft: RepairIntakeDraft) => {
    setRestoredFields(draft.fields);
    setDraftFields(draft.fields);
    setCustomerForm({
      id: draft.fields.customerId ?? "",
      fullName: draft.fields.customerName ?? "",
      phone: draft.fields.customerPhone ?? "",
      alternatePhone: draft.fields.customerAlternatePhone ?? "",
      dni: draft.fields.customerDni ?? "",
      email: draft.fields.customerEmail ?? "",
      address: draft.fields.customerAddress ?? "",
      notes: draft.fields.customerNotes ?? ""
    });
    setFormRevision((current) => current + 1);
  }, []);
  const draft = usePersistentFormDraft<RepairIntakeDraft>({
    draftKey: `repair-access:intake:${editing?.id ?? "new"}`,
    isDirty: hasUnsavedChanges,
    onRestore: restoreDraft,
    value: { fields: draftFields }
  });

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  function captureDraft(event: FormEvent<HTMLFormElement>) {
    setDraftFields(readFormValues(event.currentTarget));
  }

  function persistSubmittedDraft(event: FormEvent<HTMLFormElement>) {
    const fields = readFormValues(event.currentTarget);
    setDraftFields(fields);
    // An action can reject before passive unmount cleanup or the draft debounce runs.
    try {
      window.localStorage.setItem(
        getFormDraftStorageKey(`repair-access:intake:${editing?.id ?? "new"}`),
        JSON.stringify(createFormDraftEnvelope<RepairIntakeDraft>({ fields }))
      );
    } catch {
      // Unavailable draft storage must not interrupt the actual order save.
    }
  }

  function restoredValue(name: string, fallback = "") {
    return restoredFields[name] ?? fallback;
  }

  function updateCustomerField(field: keyof CustomerForm, value: string) {
    setCustomerForm((current) => ({ ...current, [field]: value }));
    if (field === "fullName" || field === "phone") {
      setCustomerLookup(value);
      setActiveLookupField(field === "fullName" ? "name" : "phone");
      setShowSuggestions(true);
      setActiveSuggestionCustomerId(null);
    }
  }

  function dismissSuggestions() {
    setShowSuggestions(false);
    setActiveLookupField(null);
    setActiveSuggestionCustomerId(null);
  }

  function handleLookupBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) dismissSuggestions();
  }

  function handleLookupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.querySelector<HTMLInputElement>("input")?.focus();
      dismissSuggestions();
      return;
    }
    if (!(event.target instanceof HTMLInputElement) || !suggestionsVisible || !suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = event.key === "ArrowDown"
        ? (selectedSuggestionIndex + 1) % suggestions.length
        : (selectedSuggestionIndex <= 0 ? suggestions.length : selectedSuggestionIndex) - 1;
      setActiveSuggestionCustomerId(suggestions[nextIndex].id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeSuggestionCustomerId && selectedSuggestionIndex < 0) return;
      selectCustomer(suggestions[Math.max(selectedSuggestionIndex, 0)]);
    }
  }

  function selectCustomer(customer: RepairAccessCustomerSummary) {
    setDraftFields({
      ...(formRef.current ? readFormValues(formRef.current) : draftFields),
      customerId: customer.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      customerAlternatePhone: customer.alternatePhone,
      customerDni: customer.dni,
      customerEmail: customer.email,
      customerAddress: customer.address,
      customerNotes: customer.notes
    });
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
    dismissSuggestions();
  }

  return (
    <Card className="space-y-4 [&_button]:min-h-11">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="break-words text-xl font-semibold text-slate-950 [overflow-wrap:anywhere]">
            {editing ? `Editar ingreso ${editing.repairNumber}` : "Nueva orden"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Cliente, equipo y falla. Presupuesto y cobro se cargan despues.
          </p>
        </div>
        {editing ? <Button className="w-full sm:w-auto" onClick={onCancel} type="button" variant="secondary">Cancelar edicion</Button> : null}
      </div>

      {draft.pendingDraft ? (
        <DraftRecoveryBanner
          onDiscard={draft.discardDraft}
          onRestore={draft.restoreDraft}
          updatedAt={draft.pendingDraft.updatedAt}
        />
      ) : null}

      <form
        action={action}
        className="space-y-6"
        key={formRevision}
        onChange={captureDraft}
        onInput={captureDraft}
        onSubmit={persistSubmittedDraft}
        ref={formRef}
      >
        <input name="id" type="hidden" value={editing?.id ?? ""} />
        <input name="customerId" type="hidden" value={customerForm.id} />
        <input name="deviceId" type="hidden" value={editing?.device.id ?? ""} />

        <section aria-label="Ficha de recepcion" className="grid gap-4 sm:grid-cols-6">
          <Field className="relative min-w-0 sm:col-span-3" htmlFor="customerName" label="Nombre y apellido" onBlur={handleLookupBlur} onKeyDown={handleLookupKeyDown}>
            <Input
              aria-activedescendant={suggestionsVisible && activeLookupField === "name" ? activeSuggestionId : undefined}
              aria-autocomplete="list"
              aria-controls={suggestionsVisible && activeLookupField === "name" ? `${suggestionsId}-name` : undefined}
              aria-expanded={suggestionsVisible && activeLookupField === "name"}
              autoComplete="off"
              name="customerName"
              onChange={(event) => updateCustomerField("fullName", event.target.value)}
              onFocus={() => {
                setCustomerLookup(customerForm.fullName);
                setActiveLookupField("name");
                setShowSuggestions(true);
                setActiveSuggestionCustomerId(null);
              }}
              placeholder="Ej: Malpassi Nazareno"
              role="combobox"
              value={customerForm.fullName}
            />
            <CustomerSuggestions activeIndex={selectedSuggestionIndex} id={`${suggestionsId}-name`} isSearching={isSearchingCustomers} onSelect={selectCustomer} optionIdPrefix={suggestionsId} show={suggestionsVisible && activeLookupField === "name"} suggestions={suggestions} />
          </Field>
          <Field className="relative min-w-0 sm:col-span-3" htmlFor="customerPhone" label="Telefono" onBlur={handleLookupBlur} onKeyDown={handleLookupKeyDown}>
            <Input
              aria-activedescendant={suggestionsVisible && activeLookupField === "phone" ? activeSuggestionId : undefined}
              aria-autocomplete="list"
              aria-controls={suggestionsVisible && activeLookupField === "phone" ? `${suggestionsId}-phone` : undefined}
              aria-expanded={suggestionsVisible && activeLookupField === "phone"}
              autoComplete="off"
              name="customerPhone"
              onChange={(event) => updateCustomerField("phone", event.target.value)}
              onFocus={() => {
                setCustomerLookup(customerForm.phone);
                setActiveLookupField("phone");
                setShowSuggestions(true);
                setActiveSuggestionCustomerId(null);
              }}
              placeholder="Ej: 3571 573744"
              role="combobox"
              value={customerForm.phone}
            />
            <CustomerSuggestions activeIndex={selectedSuggestionIndex} id={`${suggestionsId}-phone`} isSearching={isSearchingCustomers} onSelect={selectCustomer} optionIdPrefix={suggestionsId} show={suggestionsVisible && activeLookupField === "phone"} suggestions={suggestions} />
          </Field>
          <Field className="min-w-0 sm:col-span-4" label="Direccion">
            <Input name="customerAddress" onChange={(event) => updateCustomerField("address", event.target.value)} placeholder="Domicilio o referencia" value={customerForm.address} />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Fecha">
            <Input defaultValue={restoredValue("intakeDate", editing?.intakeDate ?? getLocalDateInputValue())} name="intakeDate" type="date" />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Equipo">
            <Input defaultValue={restoredValue("deviceType", editing?.device.deviceType ?? "")} name="deviceType" placeholder="TV, lavarropas, microondas, parlante..." />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Marca">
            <Input defaultValue={restoredValue("deviceBrand", editing?.device.brand ?? "")} name="deviceBrand" placeholder="Samsung, LG, Drean, Whirlpool..." />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Modelo">
            <Input defaultValue={restoredValue("deviceModel", editing?.device.model ?? "")} name="deviceModel" placeholder="Modelo visible" />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Serie">
            <Input defaultValue={restoredValue("serialNumber", editing?.device.serialNumber ?? "")} name="serialNumber" placeholder="Numero de serie" />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Accesorios entregados">
            <Input defaultValue={restoredValue("accessoryDetails", editing?.device.accessoryDetails ?? "")} name="accessoryDetails" placeholder="Control, fuente, cable, bandeja..." />
          </Field>
          <Field className="min-w-0 sm:col-span-2" label="Color">
            <Input defaultValue={restoredValue("deviceColor", editing?.device.color ?? "")} maxLength={80} name="deviceColor" placeholder="Color del equipo" />
          </Field>
          <Field className="min-w-0 sm:col-span-6" label="Falla">
            <Textarea defaultValue={restoredValue("issueReported", editing?.issueReported ?? "")} name="issueReported" placeholder="Ej: no enfria, no da imagen, pierde agua, no enciende..." />
          </Field>
        </section>

        <OptionalFields label="Otros datos (opcionales)">
          <Field className="lg:col-span-2" label="Telefono alternativo">
            <Input name="customerAlternatePhone" onChange={(event) => updateCustomerField("alternatePhone", event.target.value)} placeholder="Opcional" value={customerForm.alternatePhone} />
          </Field>
          <Field className="lg:col-span-2" label="DNI">
            <Input name="customerDni" onChange={(event) => updateCustomerField("dni", event.target.value)} placeholder="Opcional" value={customerForm.dni} />
          </Field>
          <Field className="lg:col-span-2" label="Email">
            <Input name="customerEmail" onChange={(event) => updateCustomerField("email", event.target.value)} placeholder="Opcional" value={customerForm.email} />
          </Field>
          <Field className="lg:col-span-3" label="Observaciones del cliente">
            <Textarea name="customerNotes" onChange={(event) => updateCustomerField("notes", event.target.value)} placeholder="Notas utiles de contacto" value={customerForm.notes} />
          </Field>
          <Field className="lg:col-span-3" label="Estado visual">
            <Input defaultValue={restoredValue("visualCondition", editing?.device.visualCondition ?? "")} name="visualCondition" placeholder="Golpes, faltantes, rayas, humedad..." />
          </Field>
          <Field className="lg:col-span-3" label="Prioridad">
            <Select defaultValue={restoredValue("priority", editing?.priority ?? "normal")} name="priority" options={repairAccessPriorityOptions.map((option) => ({ ...option }))} />
          </Field>
          <Field className="lg:col-span-3" label="Estado inicial">
            <Select defaultValue={restoredValue("status", editing?.status ?? "pendiente_revision")} name="status" options={repairAccessIntakeStatusOptions} />
          </Field>
          <Field className="lg:col-span-6" label="Observaciones internas de recepcion">
            <Textarea defaultValue={restoredValue("notes", editing?.notes ?? "")} name="notes" placeholder="Condicion de ingreso, accesorios, charla con el cliente o aclaraciones" />
          </Field>
          <p className="text-sm leading-6 text-slate-600 lg:col-span-6">
            Si elegis un cliente existente, solo se copian sus datos personales. El equipo, la falla y la reparacion siempre se cargan como una orden nueva.
          </p>
        </OptionalFields>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {editing ? `Se conserva el numero de orden ${editing.repairNumber}.` : "El numero REP se genera al guardar."}
          </p>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            {editing ? <Button className="w-full sm:w-auto" onClick={onCancel} type="button" variant="secondary">Cancelar</Button> : null}
            <FormSubmitButton
              className="w-full sm:w-auto"
              idleLabel={editing ? "Actualizar ingreso" : "Crear orden"}
              pendingLabel={editing ? "Actualizando..." : "Guardando orden..."}
            />
          </div>
        </div>
        {draft.lastSavedAt && hasUnsavedChanges ? (
          <p aria-live="polite" className="text-right text-xs text-slate-500">
            Borrador guardado en este dispositivo.
          </p>
        ) : null}
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
  primary.forEach((customer) => byId.set(customer.id, customer));
  fallback.forEach((customer) => { if (!byId.has(customer.id)) byId.set(customer.id, customer); });
  return Array.from(byId.values());
}

function CustomerSuggestions({
  activeIndex,
  id,
  optionIdPrefix,
  show,
  suggestions,
  isSearching,
  onSelect
}: {
  activeIndex: number;
  id: string;
  optionIdPrefix: string;
  show: boolean;
  suggestions: RepairAccessCustomerSummary[];
  isSearching: boolean;
  onSelect: (customer: RepairAccessCustomerSummary) => void;
}) {
  if (!show) return null;

  return (
    <div aria-label="Clientes sugeridos" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white" id={id} role="listbox">
      {suggestions.length ? suggestions.map((customer, index) => (
        <button
          aria-selected={index === activeIndex}
          className="block min-h-11 w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50 aria-selected:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite/30"
          id={`${optionIdPrefix}-${customer.id}`}
          key={customer.id}
          onPointerDown={(event) => {
            event.preventDefault();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => onSelect(customer)}
          role="option"
          type="button"
        >
          <span className="block font-semibold text-slate-950">{customer.fullName}</span>
          <span className="mt-1 block text-xs text-slate-500">
            {[customer.phone, customer.dni ? `DNI ${customer.dni}` : ""].filter(Boolean).join(" - ")}
          </span>
        </button>
      )) : (
        <div className="px-4 py-3 text-sm text-slate-500" role="status">
          {isSearching ? "Buscando cliente..." : "Sin coincidencias. Podes cargarlo como cliente nuevo."}
        </div>
      )}
    </div>
  );
}

function OptionalFields({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="border-t border-slate-200">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-graphite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/30">
        {label}
      </summary>
      {/* Keep fields mounted so closed sections still contribute to FormData and drafts. */}
      <div className="grid gap-4 pb-4 pt-2 lg:grid-cols-6">{children}</div>
    </details>
  );
}

function Field({ label, className, children, htmlFor, onBlur, onKeyDown }: { label: string; className?: string; children: ReactNode; htmlFor?: string; onBlur?: FocusEventHandler<HTMLDivElement>; onKeyDown?: KeyboardEventHandler<HTMLDivElement> }) {
  if (htmlFor) {
    return (
      <div className={className} onBlur={onBlur} onKeyDown={onKeyDown}>
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={htmlFor}>{label}</label>
        {children}
      </div>
    );
  }

  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
