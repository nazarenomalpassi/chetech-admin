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
    color: "Negro",
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
  "Nombre y apellido",
  "Telefono",
  "Direccion",
  "Fecha",
  "Equipo",
  "Marca",
  "Modelo",
  "Serie",
  "Accesorios entregados",
  "Color",
  "Falla"
];

const optionalGroups = [
  { label: "Otros datos (opcionales)", fields: ["customerAlternatePhone", "customerDni", "customerEmail", "customerNotes", "visualCondition", "priority", "status", "notes"] }
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function expectEssentialFieldsVisible() {
  for (const label of essentialLabels) {
    const field = screen.getByLabelText(label);
    expect(field.closest(".hidden, [hidden], details:not([open])"), label).toBeNull();
    expect(field.getAttribute("name"), label).toBeTruthy();
  }
}

function fillEssentialFields() {
  const values = ["Ana Gomez", "3571 123456", "Belgrano 200", "2026-10-06", "TV", "LG", "43LM", "SERIE-NUEVA", "Control y fuente", "Blanco", "No enciende"];
  essentialLabels.forEach((label, index) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value: values[index] } });
  });
}

class SaveErrorBoundary extends React.Component<{ children: React.ReactNode; onFailureCommit?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailureCommit?.();
  }

  render() {
    return this.state.failed ? <p role="alert">Guardado interrumpido</p> : this.props.children;
  }
}

describe("RepairAccessNewOrderWizard", () => {
  it("shows all reception fields in one responsive grid without disclosures or step navigation", () => {
    renderIntake();

    expectEssentialFieldsVisible();
    const sheet = screen.getByRole("region", { name: "Ficha de recepcion" });
    essentialLabels.forEach((label) => expect(sheet.contains(screen.getByLabelText(label)), label).toBe(true));
    expect(sheet.className).toContain("grid");
    expect(sheet.className).toContain("sm:grid-cols-6");
    expect(intakeForm().querySelectorAll("section")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Paso|Siguiente|Anterior/ })).toBeNull();
    expect(intakeForm().querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("keeps one labelled optional disclosure closed, mounted and enabled", () => {
    renderIntake();

    expect(intakeForm().querySelectorAll("details")).toHaveLength(1);
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
      customerDni: "", customerEmail: "", customerAddress: "Belgrano 200", customerNotes: "",
      deviceType: "TV", deviceBrand: "LG", deviceModel: "43LM",
      serialNumber: "SERIE-NUEVA", accessoryDetails: "Control y fuente", deviceColor: "Blanco", visualCondition: "",
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
      serialNumber: "SERIE-123", accessoryDetails: "Control y cable", deviceColor: "Negro", visualCondition: "Rayas en la base",
      intakeDate: "2026-09-18", issueReported: "No da imagen",
      priority: "urgente", status: "en_reparacion", notes: "Revisar conectores"
    });
  });

  it("submits normally without an uncaught error when the submit-time storage snapshot throws", async () => {
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => undefined);
    const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });
    const errors: unknown[] = [];
    function captureError(event: ErrorEvent) {
      errors.push(event.error);
      event.preventDefault();
    }
    window.addEventListener("error", captureError);
    try {
      renderIntake({ editing, action });
      const expected = Object.fromEntries(new FormData(intakeForm()).entries());
      fireEvent.submit(intakeForm());
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

      expect(storageWrite).toHaveBeenCalled();
      expect(errors).toEqual([]);
      expect(Object.fromEntries(action.mock.calls[0][0].entries())).toEqual(expected);
    } finally {
      storageWrite.mockRestore();
      window.removeEventListener("error", captureError);
    }
  });

  it("keeps modified optional fields after opening and closing the disclosure", () => {
    renderIntake({ editing });
    const changes = [
      { group: "Otros datos (opcionales)", label: "Observaciones del cliente", name: "customerNotes", value: "Solo WhatsApp" },
      { group: "Otros datos (opcionales)", label: "Estado visual", name: "visualCondition", value: "Base rayada" },
      { group: "Otros datos (opcionales)", label: "Observaciones internas de recepcion", name: "notes", value: "Etiqueta nueva" }
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

  it("preserves unsaved values, focus and the form when the same order object refreshes", async () => {
    vi.useFakeTimers();
    const onDirtyChange = vi.fn();
    const view = renderIntake({ editing, onDirtyChange });
    const form = intakeForm();
    const name = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(name, { target: { value: "Maria Perez corregido" } });
    fireEvent.change(screen.getByLabelText("Direccion"), { target: { value: "Direccion corregida" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Serie"), { target: { value: "SERIE-CORREGIDA" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Plateado" } });
    fireEvent.change(screen.getByLabelText("Falla"), { target: { value: "Falla corregida" } });
    act(() => name.focus());
    const expected = Object.fromEntries(new FormData(form).entries());

    view.rerender(
      <RepairAccessNewOrderWizard action={async () => undefined} customers={[]} editing={{ ...editing, customer: { ...editing.customer }, device: { ...editing.device } }} onCancel={() => undefined} onDirtyChange={onDirtyChange} />
    );

    expect(intakeForm()).toBe(form);
    expect(screen.getByLabelText("Nombre y apellido")).toBe(name);
    expect(document.activeElement).toBe(name);
    expect(Object.fromEntries(new FormData(form).entries())).toEqual(expected);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const saved = JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:order-1"))!);
    expect(saved.data.fields).toEqual(expected);
  });

  it("preserves a restored edit draft when the same order refreshes", () => {
    const fields = { customerName: "Nombre recuperado", customerAddress: "Direccion recuperada", deviceColor: "Verde", issueReported: "Falla recuperada" };
    localStorage.setItem(getFormDraftStorageKey("repair-access:intake:order-1"), JSON.stringify(createFormDraftEnvelope({ fields })));
    const view = renderIntake({ editing });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    const form = intakeForm();

    view.rerender(
      <RepairAccessNewOrderWizard action={async () => undefined} customers={[]} editing={{ ...editing }} onCancel={() => undefined} />
    );

    expect(intakeForm()).toBe(form);
    const data = new FormData(form);
    Object.entries(fields).forEach(([key, value]) => expect(data.get(key), key).toBe(value));
  });

  it("loads another order and clears edit state when the editing identity changes", () => {
    const view = renderIntake({ editing });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Sin guardar" } });
    const nextOrder = { ...editing, id: "order-2", repairNumber: "REP-000500", device: { ...editing.device, id: "device-2", color: "Blanco" } };

    view.rerender(
      <RepairAccessNewOrderWizard action={async () => undefined} customers={[]} editing={nextOrder} onCancel={() => undefined} />
    );

    const data = new FormData(intakeForm());
    expect(data.get("id")).toBe("order-2");
    expect(data.get("deviceId")).toBe("device-2");
    expect(data.get("deviceColor")).toBe("Blanco");
    expect(screen.getByRole("heading", { name: "Editar ingreso REP-000500" })).not.toBeNull();
  });

  it.each(["Nombre y apellido", "Telefono"])("keeps customer suggestions by %s and does not reuse a device", (label) => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value: label === "Nombre y apellido" ? "Maria" : "573744" } });
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
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Maria" } });
    fireEvent.click(screen.getByRole("option", { name: /Maria Perez/ }));

    expect(new FormData(intakeForm()).get("customerId")).toBe(customer.id);
  });

  it("persists a selected customer's IDs and optional data even without another field edit", async () => {
    vi.useFakeTimers();
    const onDirtyChange = vi.fn();
    renderIntake({ customers: [customer], onDirtyChange });
    const field = screen.getByLabelText("Nombre y apellido");
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
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Ana Rem" } });
    expect(fetchCustomers).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(fetchCustomers).toHaveBeenCalledWith("/api/repair-access/customers?q=Ana%20Rem", { signal: expect.any(AbortSignal) });
    fireEvent.click(screen.getByRole("option", { name: /Ana Remota/ }));

    const data = new FormData(intakeForm());
    expect(data.get("customerId")).toBe(remote.id);
    expect(data.get("customerEmail")).toBe(remote.email);
    expect(data.get("customerNotes")).toBe(remote.notes);
  });

  it("uses authoritative remote DB fields over cached props for the same customer ID without duplicate suggestions", async () => {
    vi.useFakeTimers();
    const remote = {
      ...customer,
      fullName: "Maria Perez Actualizada",
      phone: "3571 999999",
      alternatePhone: "",
      dni: "35123456",
      email: "maria.actualizada@example.com",
      address: "Direccion actualizada 200",
      notes: ""
    };
    const cachedOnly = { ...customer, id: "cached-only", fullName: "Maria Gomez" };
    const remoteOnly = { ...customer, id: "remote-only", fullName: "Maria Diaz" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ customers: [remote, remote, remoteOnly] }) })));
    renderIntake({ customers: [customer, cachedOnly] });
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Maria" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });

    const listbox = screen.getByRole("listbox", { name: "Clientes sugeridos" });
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(screen.getByRole("option", { name: /Maria Gomez/ })).not.toBeNull();
    expect(screen.getByRole("option", { name: /Maria Diaz/ })).not.toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Maria Perez Actualizada/ }));

    const data = new FormData(intakeForm());
    expect(Object.fromEntries(data.entries())).toMatchObject({
      customerId: customer.id,
      customerName: remote.fullName,
      customerPhone: remote.phone,
      customerAlternatePhone: "",
      customerDni: remote.dni,
      customerEmail: remote.email,
      customerAddress: remote.address,
      customerNotes: "",
      deviceId: ""
    });
  });

  it("shows remote-only matches before the seven-item cached suggestion limit", async () => {
    vi.useFakeTimers();
    const cached = Array.from({ length: 7 }, (_, index) => ({ ...customer, id: `cached-${index}`, fullName: `Maria Local ${index}` }));
    const remote = { ...customer, id: "remote-only", fullName: "Maria Nueva" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ customers: [remote] }) })));
    renderIntake({ customers: cached });
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Maria" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    const options = screen.getByRole("listbox", { name: "Clientes sugeridos" }).querySelectorAll('[role="option"]');
    expect(options[0].textContent).toContain("Maria Nueva");
    expect(options).toHaveLength(7);
    fireEvent.click(screen.getByRole("option", { name: /Maria Nueva/ }));
    expect(new FormData(intakeForm()).get("customerId")).toBe("remote-only");
  });

  it("aborts an in-flight lookup when the query changes or the form unmounts", async () => {
    vi.useFakeTimers();
    const response = deferred<Response>();
    const fetchCustomers = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(() => response.promise);
    vi.stubGlobal("fetch", fetchCustomers);
    const view = renderIntake();
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    const firstSignal = fetchCustomers.mock.calls[0][1]?.signal;

    fireEvent.change(field, { target: { value: "Ana Rem" } });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    const secondSignal = fetchCustomers.mock.calls[1][1]?.signal;
    expect(secondSignal?.aborted).toBe(false);
    view.unmount();
    expect(secondSignal?.aborted).toBe(true);
  });

  it("ignores stale lookup bodies even when the canceled request resolves after the latest response", async () => {
    vi.useFakeTimers();
    const staleBody = deferred<{ customers: RepairAccessCustomerSummary[] }>();
    const stale = { ...customer, id: "stale", fullName: "Ana Remota Antigua" };
    const latest = { ...customer, id: "latest", fullName: "Ana Remota Actual" };
    const fetchCustomers = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => staleBody.promise })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customers: [latest] }) });
    vi.stubGlobal("fetch", fetchCustomers);
    renderIntake();
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    fireEvent.change(field, { target: { value: "Ana Rem" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(screen.getByText(latest.fullName)).not.toBeNull();

    await act(async () => { staleBody.resolve({ customers: [stale] }); });

    expect(screen.queryByText(stale.fullName)).toBeNull();
    expect(screen.getByText(latest.fullName)).not.toBeNull();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(new FormData(intakeForm()).get("customerId")).toBe(latest.id);
  });

  it("ignores stale lookup failures without clearing newer results", async () => {
    vi.useFakeTimers();
    const staleResponse = deferred<Response>();
    const latest = { ...customer, id: "latest", fullName: "Ana Remota Actual" };
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(staleResponse.promise)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customers: [latest] }) }));
    renderIntake();
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    fireEvent.change(field, { target: { value: "Ana Rem" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });

    await act(async () => { staleResponse.reject(new Error("Canceled lookup")); });

    expect(screen.getByText(latest.fullName)).not.toBeNull();
  });

  it.each(["Nombre y apellido", "Telefono"])("selects the highlighted customer with arrow keys and Enter from %s", (label) => {
    const second = { ...customer, id: "customer-2", fullName: "Maria Diaz" };
    renderIntake({ customers: [customer, second] });
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value: label === "Telefono" ? "573744" : "Maria" } });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("option", { name: /Maria Diaz/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field, { key: "Enter" });

    expect(new FormData(intakeForm()).get("customerId")).toBe(second.id);
    expect(field.getAttribute("aria-expanded")).toBe("false");
  });

  it("preserves the highlighted customer ID when asynchronous results reorder suggestions", async () => {
    vi.useFakeTimers();
    const cached = [customer, { ...customer, id: "highlighted", fullName: "Maria Z" }];
    const remote = [{ ...customer, id: "remote-a", fullName: "Maria A" }, { ...customer, id: "remote-b", fullName: "Maria B" }];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ customers: remote }) })));
    renderIntake({ customers: cached });
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Maria" } });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Maria Z/ }).getAttribute("aria-selected")).toBe("true");
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(screen.getByRole("option", { name: /Maria Z/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(new FormData(intakeForm()).get("customerId")).toBe("highlighted");
  });

  it("dismisses suggestions with Escape and does not select a hidden suggestion on Enter", () => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Maria" } });
    expect(screen.getByText(customer.fullName)).not.toBeNull();
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByText(customer.fullName)).toBeNull();
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
    expect(new FormData(intakeForm()).get("customerId")).toBe("");
  });

  it("does not select a customer while Enter is confirming IME composition", () => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText("Nombre y apellido") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "Maria" } });
    expect(fireEvent.keyDown(field, { key: "Enter", isComposing: true })).toBe(true);

    expect(new FormData(intakeForm()).get("customerId")).toBe("");
    expect(field.value).toBe("Maria");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(new FormData(intakeForm()).get("customerId")).toBe(customer.id);
  });

  it("dismisses a keyboard-focused suggestion with Escape and returns focus to its input", () => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText("Nombre y apellido");
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "Maria" } });
    const option = screen.getByRole("option", { name: /Maria Perez/ });
    act(() => option.focus());
    fireEvent.keyDown(option, { key: "Escape" });

    expect(screen.queryByText(customer.fullName)).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(new FormData(intakeForm()).get("customerId")).toBe("");
  });

  it("closes the dropdown on blur outside the lookup and aborts pending remote work", async () => {
    vi.useFakeTimers();
    const response = deferred<Response>();
    const fetchCustomers = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(() => response.promise);
    vi.stubGlobal("fetch", fetchCustomers);
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Maria" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    fireEvent.blur(field, { relatedTarget: screen.getByLabelText("Direccion") });

    expect(screen.queryByText(customer.fullName)).toBeNull();
    expect(fetchCustomers.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
    expect(new FormData(intakeForm()).get("customerId")).toBe("");
  });

  it("keeps suggestions available when blur moves to a suggestion for keyboard activation", () => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText("Nombre y apellido");
    fireEvent.change(field, { target: { value: "Maria" } });
    const option = screen.getByRole("option", { name: /Maria Perez/ });
    fireEvent.blur(field, { relatedTarget: option });
    expect(screen.getByRole("option", { name: /Maria Perez/ })).toBe(option);
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);

    expect(new FormData(intakeForm()).get("customerId")).toBe(customer.id);
  });

  it("keeps touch pointer selection alive until click even when default focus would blur without a related target", () => {
    renderIntake({ customers: [customer] });
    const field = screen.getByLabelText("Nombre y apellido");
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "Maria" } });
    const option = screen.getByRole("option", { name: /Maria Perez/ });
    const defaultFocusAllowed = fireEvent.pointerDown(option, { pointerType: "touch" });
    if (defaultFocusAllowed) fireEvent.blur(field, { relatedTarget: null });
    fireEvent.click(option);

    expect(new FormData(intakeForm()).get("customerId")).toBe(customer.id);
    expect(defaultFocusAllowed).toBe(false);
  });

  it("enforces 44px minimum targets for recovery buttons inside the intake", () => {
    localStorage.setItem(getFormDraftStorageKey("repair-access:intake:new"), JSON.stringify(createFormDraftEnvelope({ fields: { customerName: "Ana" } })));
    const view = renderIntake();

    expect(screen.getByRole("button", { name: "Recuperar" })).not.toBeNull();
    expect(view.container.firstElementChild?.classList.contains("[&_button]:min-h-11")).toBe(true);
  });

  it("persists and restores a color-only draft as meaningful unsaved input", async () => {
    vi.useFakeTimers();
    const onDirtyChange = vi.fn();
    const view = renderIntake({ onDirtyChange });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Azul" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    const saved = JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:new"))!);
    expect(saved.data.fields.deviceColor).toBe("Azul");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    renderIntake();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(new FormData(intakeForm()).get("deviceColor")).toBe("Azul");
    expectEssentialFieldsVisible();
  });

  it.each(["cliente", "equipo", "ingreso"])("restores a legacy %s-step draft without hiding essential fields", (activeStep) => {
    const fields = {
      customerId: customer.id, customerName: customer.fullName, customerPhone: customer.phone,
      customerAddress: "Mitre 500", accessoryDetails: "Fuente y cable", deviceColor: "Rojo",
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
    fireEvent.change(screen.getByLabelText("Falla"), { target: { value: "No enciende" } });
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
    fireEvent.change(screen.getByLabelText("Falla"), { target: { value: "Se apaga al encender" } });
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

  it("durably snapshots all submitted values before the action and the error fallback commit", async () => {
    const storageKey = getFormDraftStorageKey("repair-access:intake:order-1");
    let savedBeforeAction: string | null = null;
    let savedAtFailureCommit: string | null = null;
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => {
      savedBeforeAction = localStorage.getItem(storageKey);
      throw new Error("Synthetic immediate save failure");
    });
    render(
      <SaveErrorBoundary onFailureCommit={() => { savedAtFailureCommit = localStorage.getItem(storageKey); }}>
        <RepairAccessNewOrderWizard action={action} customers={[]} editing={editing} onCancel={() => undefined} />
      </SaveErrorBoundary>,
      { onCaughtError: () => undefined }
    );
    fillEssentialFields();
    fireEvent.change(screen.getByLabelText("Observaciones internas de recepcion"), { target: { value: "Notas sin guardar" } });
    const expected = Object.fromEntries(new FormData(intakeForm()).entries());
    fireEvent.submit(intakeForm());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Guardado interrumpido"));
    await act(async () => {});

    expect(action).toHaveBeenCalledTimes(1);
    expect.soft(JSON.parse(savedBeforeAction ?? "null")?.data.fields, "snapshot before action").toEqual(expected);
    expect.soft(JSON.parse(savedAtFailureCommit ?? "null")?.data.fields, "snapshot at error fallback commit").toEqual(expected);
    expect(JSON.parse(localStorage.getItem(storageKey)!)?.data.fields, "snapshot after passive cleanup").toEqual(expected);
  });

  it("recovers submitted browser-autofill values even without a change event", async () => {
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => { throw new Error("Synthetic autofill save failure"); });
    const view = render(
      <SaveErrorBoundary>
        <RepairAccessNewOrderWizard action={action} customers={[]} editing={editing} onCancel={() => undefined} />
      </SaveErrorBoundary>,
      { onCaughtError: () => undefined }
    );
    (screen.getByLabelText("Nombre y apellido") as HTMLInputElement).value = "Nombre autocompletado";
    (screen.getByLabelText("Direccion") as HTMLInputElement).value = "Direccion autocompletada";
    (screen.getByLabelText("Color") as HTMLInputElement).value = "Plateado";
    const expected = Object.fromEntries(new FormData(intakeForm()).entries());
    fireEvent.submit(intakeForm());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Guardado interrumpido"));
    await act(async () => {});

    expect(Object.fromEntries(action.mock.calls[0][0].entries())).toEqual(expected);
    expect(JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:order-1"))!)?.data.fields).toEqual(expected);
    view.unmount();
    renderIntake({ editing });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(Object.fromEntries(new FormData(intakeForm()).entries())).toEqual(expected);
  });

  it("recovers newer edits made while a save is pending instead of restoring the older submitted snapshot", async () => {
    const pendingSave = deferred<void>();
    const action = vi.fn<(data: FormData) => Promise<void>>(() => pendingSave.promise);
    const view = render(
      <SaveErrorBoundary>
        <RepairAccessNewOrderWizard action={action} customers={[]} editing={editing} onCancel={() => undefined} />
      </SaveErrorBoundary>,
      { onCaughtError: () => undefined }
    );
    fireEvent.change(screen.getByLabelText("Falla"), { target: { value: "Falla enviada" } });
    const form = intakeForm();
    fireEvent.submit(form);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0].get("issueReported")).toBe("Falla enviada");
    fireEvent.change(screen.getByLabelText("Falla"), { target: { value: "Falla corregida durante el guardado" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Azul corregido" } });
    const expected = Object.fromEntries(new FormData(form).entries());
    await act(async () => { pendingSave.reject(new Error("Synthetic delayed save failure")); });

    expect(screen.getByRole("alert").textContent).toBe("Guardado interrumpido");
    expect(JSON.parse(localStorage.getItem(getFormDraftStorageKey("repair-access:intake:order-1"))!)?.data.fields).toEqual(expected);
    view.unmount();
    renderIntake({ editing });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(Object.fromEntries(new FormData(intakeForm()).entries())).toEqual(expected);
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
