// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RepairAccessNewOrderWizard } from "@/features/repairs-access/components/repair-access-new-order-wizard";
import type { RepairAccessCustomerSummary, RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";

Object.assign(globalThis, { React });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ customers: [] }) })));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const customer: RepairAccessCustomerSummary = {
  id: "customer-1",
  fullName: "Maria Perez",
  phone: "3571 573744",
  alternatePhone: "3571 600000",
  dni: "30123456",
  email: "maria@example.com",
  address: "San Martin 100",
  notes: "Llamar por la tarde",
  source: "manual",
  createdAt: "2026-09-18T12:00:00.000Z"
};

const intakeEditing: Pick<RepairAccessOrderRecord,
  "id" | "repairNumber" | "customer" | "device" | "intakeDate" | "issueReported" | "priority" | "status" | "notes"
> = {
  id: "order-1",
  repairNumber: "REP-2026-00001234",
  customer: { ...customer, phoneNormalized: "3571573744" },
  device: {
    id: "device-1",
    deviceType: "TV",
    brand: "Samsung",
    model: "UN43",
    serialNumber: "SERIE-123",
    accessoryDetails: "Control y cable",
    visualCondition: "Rayas en la base",
    notes: ""
  },
  intakeDate: "2026-09-18",
  issueReported: "No da imagen",
  priority: "urgente",
  status: "en_reparacion",
  notes: "Revisar conectores"
};

const editing = intakeEditing as RepairAccessOrderRecord;

const essentialLabels = [
  "Nombre completo",
  "Telefono / WhatsApp",
  "Tipo de equipo",
  "Marca",
  "Modelo",
  "Fecha de ingreso",
  "Falla declarada por el cliente"
];

const optionalGroups = [
  { label: "Mas datos del cliente", fields: ["customerAlternatePhone", "customerDni", "customerEmail", "customerAddress", "customerNotes"] },
  { label: "Detalles del equipo", fields: ["serialNumber", "accessoryDetails", "visualCondition"] },
  { label: "Opciones de ingreso", fields: ["priority", "status", "notes"] }
];

function renderIntake(props: Partial<React.ComponentProps<typeof RepairAccessNewOrderWizard>> = {}) {
  return render(
    <RepairAccessNewOrderWizard action={async () => undefined} customers={[]} editing={null} onCancel={() => undefined} {...props} />
  );
}

function intakeForm() {
  return screen.getByRole("button", { name: /Crear orden|Actualizar ingreso/ }).closest("form")!;
}

function disclosure(label: string) {
  return screen.getByText(label, { selector: "summary" }).closest("details")!;
}

function expectEssentialFieldsVisible() {
  for (const label of essentialLabels) {
    const field = screen.getByLabelText(label);
    expect(field.closest(".hidden, [hidden], details:not([open])"), label).toBeNull();
    expect(field.getAttribute("name"), label).toBeTruthy();
  }
}

function fillEssentialFields() {
  const values = ["Ana Gomez", "3571 123456", "TV", "LG", "43LM", "2026-10-06", "No enciende"];
  essentialLabels.forEach((label, index) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value: values[index] } });
  });
}

class SaveErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p role="alert">Guardado interrumpido</p> : this.props.children;
  }
}

describe("RepairAccessNewOrderWizard", () => {
  it("shows customer, equipment, date and failure together without step navigation", () => {
    renderIntake();

    expectEssentialFieldsVisible();
    expect(screen.queryByRole("button", { name: /Paso|Siguiente|Anterior/ })).toBeNull();
    expect(intakeForm().querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("keeps labelled optional disclosures closed, mounted and enabled", () => {
    renderIntake();

    for (const group of optionalGroups) {
      const details = disclosure(group.label);
      expect(details.open).toBe(false);
      expect(details.querySelector("summary")?.className).toContain("min-h-11");
      for (const name of group.fields) {
        const field = details.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
        expect(field, name).not.toBeNull();
        expect(field.disabled, name).toBe(false);
        expect(field.labels?.length, name).toBe(1);
        expect(new FormData(intakeForm()).has(name), name).toBe(true);
      }
    }
  });

  it("submits a new order once with all original field names and no client-generated REP", async () => {
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => undefined);
    renderIntake({ action });
    fillEssentialFields();
    fireEvent.submit(intakeForm());

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][0];
    expect(Object.fromEntries(data.entries())).toEqual({
      id: "", customerId: "", deviceId: "",
      customerName: "Ana Gomez", customerPhone: "3571 123456", customerAlternatePhone: "",
      customerDni: "", customerEmail: "", customerAddress: "", customerNotes: "",
      deviceType: "TV", deviceBrand: "LG", deviceModel: "43LM",
      serialNumber: "", accessoryDetails: "", visualCondition: "",
      intakeDate: "2026-10-06", issueReported: "No enciende",
      priority: "normal", status: "pendiente_revision", notes: ""
    });
  });

  it("shows editing essentials and preserves all optional values and IDs on submit while closed", async () => {
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => undefined);
    renderIntake({ editing, action });
    expectEssentialFieldsVisible();
    expect(screen.getByRole("heading", { name: `Editar ingreso ${editing.repairNumber}` })).not.toBeNull();
    optionalGroups.forEach((group) => expect(disclosure(group.label).open).toBe(false));
    fireEvent.submit(intakeForm());

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0][0].entries())).toEqual({
      id: "order-1", customerId: "customer-1", deviceId: "device-1",
      customerName: customer.fullName, customerPhone: customer.phone, customerAlternatePhone: customer.alternatePhone,
      customerDni: customer.dni, customerEmail: customer.email, customerAddress: customer.address, customerNotes: customer.notes,
      deviceType: "TV", deviceBrand: "Samsung", deviceModel: "UN43",
      serialNumber: "SERIE-123", accessoryDetails: "Control y cable", visualCondition: "Rayas en la base",
      intakeDate: "2026-09-18", issueReported: "No da imagen",
      priority: "urgente", status: "en_reparacion", notes: "Revisar conectores"
    });
  });

  it("keeps modified optional fields after opening and closing their disclosures", () => {
    renderIntake({ editing });
    const changes = [
      { group: "Mas datos del cliente", label: "Observaciones del cliente", name: "customerNotes", value: "Solo WhatsApp" },
      { group: "Detalles del equipo", label: "Accesorios entregados", name: "accessoryDetails", value: "Sin control" },
      { group: "Opciones de ingreso", label: "Observaciones internas de recepcion", name: "notes", value: "Etiqueta nueva" }
    ];

    changes.forEach(({ group, label, name, value }) => {
      const details = disclosure(group);
      fireEvent.click(details.querySelector("summary")!);
      expect(details.open).toBe(true);
      const field = screen.getByLabelText(label);
      fireEvent.change(field, { target: { value } });
      fireEvent.click(details.querySelector("summary")!);
      expect(details.open).toBe(false);
      expect(screen.getByLabelText(label)).toBe(field);
      expect(new FormData(intakeForm()).get(name)).toBe(value);
    });
  });

  it.each(["Nombre completo", "Telefono / WhatsApp"])("keeps customer suggestions by %s and does not reuse a device", (label) => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value: label === "Nombre completo" ? "Maria" : "573744" } });
    fireEvent.keyDown(field, { key: "Enter" });

    const data = new FormData(intakeForm());
    expect(data.get("customerId")).toBe(customer.id);
    expect(data.get("customerName")).toBe(customer.fullName);
    expect(data.get("customerPhone")).toBe(customer.phone);
    expect(data.get("customerNotes")).toBe(customer.notes);
    expect(data.get("deviceId")).toBe("");
    expect(data.get("deviceType")).toBe("");
  });

  it("allows activating a customer suggestion with a click or keyboard-generated click", () => {
    renderIntake({ customers: [customer] });
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Maria" } });
    fireEvent.click(screen.getByRole("button", { name: /Maria Perez/ }));

    expect(new FormData(intakeForm()).get("customerId")).toBe(customer.id);
  });

  it("persists a selected customer's IDs and optional data even without another field edit", async () => {
    vi.useFakeTimers();
    const onDirtyChange = vi.fn();
    renderIntake({ customers: [customer], onDirtyChange });
    const field = screen.getByLabelText("Nombre completo");
    fireEvent.change(field, { target: { value: "Maria" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    const saved = JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:new"))!);
    expect(saved.data.fields.customerId).toBe(customer.id);
    expect(saved.data.fields.customerName).toBe(customer.fullName);
    expect(saved.data.fields.customerNotes).toBe(customer.notes);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("keeps debounced remote customer suggestions and submitted optional values", async () => {
    vi.useFakeTimers();
    const remote = { ...customer, id: "remote-customer", fullName: "Ana Remota" };
    const fetchCustomers = vi.fn(async () => ({ ok: true, json: async () => ({ customers: [remote] }) }));
    vi.stubGlobal("fetch", fetchCustomers);
    renderIntake();
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Ana Rem" } });
    expect(fetchCustomers).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(fetchCustomers).toHaveBeenCalledWith("/api/repair-access/customers?q=Ana%20Rem");
    fireEvent.click(screen.getByRole("button", { name: /Ana Remota/ }));

    const data = new FormData(intakeForm());
    expect(data.get("customerId")).toBe(remote.id);
    expect(data.get("customerEmail")).toBe(remote.email);
    expect(data.get("customerNotes")).toBe(remote.notes);
  });

  it("enforces 44px minimum targets for recovery buttons inside the intake", () => {
    localStorage.setItem(getFormDraftStorageKey("repair-access:intake:new"), JSON.stringify(createFormDraftEnvelope({ fields: { customerName: "Ana" } })));
    const view = renderIntake();

    expect(screen.getByRole("button", { name: "Recuperar" })).not.toBeNull();
    expect(view.container.firstElementChild?.classList.contains("[&_button]:min-h-11")).toBe(true);
  });

  it.each(["cliente", "equipo", "ingreso"])("restores a legacy %s-step draft without hiding essential fields", (activeStep) => {
    const fields = {
      customerId: customer.id, customerName: customer.fullName, customerPhone: customer.phone,
      customerNotes: "Borrador de contacto", deviceType: "TV", deviceBrand: "LG", deviceModel: "43LM",
      serialNumber: "SERIE-BORRADOR", intakeDate: "2026-10-05", issueReported: "Se apaga",
      priority: "alta", status: "en_pruebas", notes: "Pendiente de confirmar"
    };
    localStorage.setItem(getFormDraftStorageKey("repair-access:intake:new"), JSON.stringify(createFormDraftEnvelope({ activeStep, fields })));
    const onDirtyChange = vi.fn();
    renderIntake({ onDirtyChange });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));

    expectEssentialFieldsVisible();
    const data = new FormData(intakeForm());
    Object.entries(fields).forEach(([name, value]) => expect(data.get(name), name).toBe(value));
    optionalGroups.forEach((group) => expect(disclosure(group.label).open).toBe(false));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("discards a pending draft without changing editing values", () => {
    const storageKey = getFormDraftStorageKey("repair-access:intake:order-1");
    localStorage.setItem(storageKey, JSON.stringify(createFormDraftEnvelope({ fields: { customerName: "Otro nombre" } })));
    const onDirtyChange = vi.fn();
    renderIntake({ editing, onDirtyChange });
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(new FormData(intakeForm()).get("customerName")).toBe(customer.fullName);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("preserves the dirty navigation guard and saves a draft on unmount", () => {
    const onDirtyChange = vi.fn();
    const view = renderIntake({ onDirtyChange });
    fireEvent.change(screen.getByLabelText("Falla declarada por el cliente"), { target: { value: "No enciende" } });
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);

    expect(beforeUnload.defaultPrevented).toBe(true);
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    const saved = JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:new"))!);
    expect(saved.data.fields.issueReported).toBe("No enciende");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("recovers every submitted value after a rejected save without clearing the draft", async () => {
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => { throw new Error("Synthetic save failure"); });
    const view = render(
      <SaveErrorBoundary>
        <RepairAccessNewOrderWizard action={action} customers={[]} editing={editing} onCancel={() => undefined} />
      </SaveErrorBoundary>,
      { onCaughtError: () => undefined }
    );
    fireEvent.change(screen.getByLabelText("Falla declarada por el cliente"), { target: { value: "Se apaga al encender" } });
    const expected = Object.fromEntries(new FormData(intakeForm()).entries());
    fireEvent.submit(intakeForm());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Guardado interrumpido"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(action.mock.calls[0][0].entries())).toEqual(expected);
    const saved = JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:order-1"))!);
    expect(saved.data.fields).toEqual(expected);

    view.unmount();
    renderIntake({ editing });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(Object.fromEntries(new FormData(intakeForm()).entries())).toEqual(expected);
    expectEssentialFieldsVisible();
  });

  it("keeps the editing cancellation callback", () => {
    const onCancel = vi.fn();
    renderIntake({ editing, onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("prefills intake date with the operational day after UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T01:30:00.000Z"));

    const html = renderToStaticMarkup(
      <RepairAccessNewOrderWizard
        action={async () => undefined}
        customers={[]}
        editing={null}
        onCancel={() => undefined}
      />
    );

    expect(html).toMatch(/name="intakeDate"[^>]*value="2026-09-18"/);
  });
});
