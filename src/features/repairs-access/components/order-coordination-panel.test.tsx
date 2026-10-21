// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepairAccessOrderRecord } from "../queries";
import { CoordinationDialog, OrderCoordinationPanel, PartManagementDialog } from "./order-coordination-panel";

Object.assign(globalThis, { React });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./repair-order-activity", () => ({ RepairOrderActivity: () => null }));

const order: RepairAccessOrderRecord = {
  id: "order-1", repairNumber: "REP-000064", status: "presupuestado",
  budgetAmount: 100, finalAmount: 0, deliveredAt: null,
  intakeDate: "2026-10-05", issueReported: "No enciende", technicalDiagnosis: null,
  repairProgress: null, budgetDetail: null, budgetResponseNotes: null, budgetResponseAt: null,
  approvedAmount: 0, paymentMethod: "", paymentNotes: null, isPaid: false, paidAt: null,
  pickedUpAt: null, hasWarranty: false, warrantyRequiresReview: false, warrantyStart: null,
  warrantyUntil: null, warrantyDays: 0, warrantyConditions: null, warrantyActive: false,
  historicalWarrantyExpired: null, legacyOrderNumber: null, importSource: null,
  importFileName: null, importRowKey: null, importedAt: null, workPerformed: null,
  usedParts: null, internalObservations: null, technicianName: null, customerUserId: null,
  customerPublicId: null, publicProgress: null, publicNextStep: null,
  budgetVisibleToCustomer: false, publicBudgetDescription: null, budgetValidUntil: null,
  customerActionRequired: false, lastCustomerVisibleUpdateAt: null, customerPortalLinked: false,
  storefrontCustomer: null, notes: null, priority: null, createdAt: "2026-10-05T12:00:00Z",
  warranty: {
    code: "none", label: "Sin garantia", tone: "neutral", startsOn: null, expiresOn: null,
    daysRemaining: null, daysElapsed: null, description: "Sin garantia"
  },
  customer: { id: "customer-1", fullName: "Cliente prueba", phone: "", alternatePhone: "",
    phoneNormalized: "", dni: "", email: "", address: "", notes: "" },
  device: { id: "device-1", deviceType: "Televisor", brand: "Marca", model: "Modelo",
    serialNumber: "", accessoryDetails: "", visualCondition: "", notes: "" },
  workflow: {
    version: 1, budgetRevision: 1, approvalStatus: "pending", approvedAmount: null,
    assignedTechnicianId: null, assignedTechnicianName: null, location: null,
    nextActionDate: null, qualityCheckedAt: null, qualityNotes: null, parts: [], events: []
  }
};

describe("order collection shortcut", () => {
  it("offers Pago y garantía only with a recorded pickup and preserves legacy closed-order actions", () => {
    const recorded = renderToStaticMarkup(<OrderCoordinationPanel order={{ ...order, status: "retirado", pickedUpAt: "2026-10-20T03:00:00Z" }} canManage />);
    expect(recorded).toContain("Pago y garantía PDF");
    expect(recorded).toContain("kind=delivery");
    const legacy = renderToStaticMarkup(<OrderCoordinationPanel order={{ ...order, status: "retirado", pickedUpAt: null, deliveredAt: null }} canManage />);
    expect(legacy).not.toContain("kind=delivery");
    expect(legacy).not.toContain("Solicitar repuesto");
  });
  it.each([
    { budgetAmount: 0, finalAmount: 0, isPaid: false, debt: false },
    { budgetAmount: 100, finalAmount: 0, hasFinalAmount: false, isPaid: false, debt: true },
    { budgetAmount: 100, finalAmount: 0, hasFinalAmount: true, isPaid: false, debt: true },
    { budgetAmount: 0, finalAmount: 100, isPaid: false, debt: true },
    { budgetAmount: 100, finalAmount: 100, isPaid: true, debt: false }
  ])("coordina la devolucion sin fallas con autorizacion solo ante deuda: %j", (amounts) => {
    render(<OrderCoordinationPanel order={{ ...order, status: "no_presenta_fallas", ...amounts }} canManage />);
    expect(screen.getByText("Coordinar devolucion del equipo")).toBeTruthy();
    expect(screen.queryByText("Sin confirmacion vigente")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cliente confirmo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cliente rechazo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    expect((screen.getByLabelText("Persona que retira") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Confirmo que el cliente retiro el equipo") as HTMLInputElement).required).toBe(true);
    const authorization = screen.queryByLabelText(/Autorizo entrega con saldo pendiente/);
    expect(Boolean(authorization)).toBe(amounts.debt);
    if (authorization) {
      expect((authorization as HTMLInputElement).checked).toBe(false);
      fireEvent.click(authorization);
      expect((screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement).required).toBe(true);
    }
  });

  it("keeps workshop actions visible and documents in a separate disclosure", () => {
    render(<OrderCoordinationPanel order={order} canManage />);
    expect(screen.getByRole("button", { name: "Cliente confirmo" }).closest("details")).toBeNull();
    expect(screen.getByRole("button", { name: "Solicitar repuesto" }).closest("details")).toBeNull();
    const documents = screen.getByText("Documentos y cobros").closest("details")!;
    expect(documents.open).toBe(false);
    fireEvent.click(screen.getByText("Documentos y cobros"));
    expect(documents.open).toBe(true);
    expect(screen.getByRole("link", { name: "Comprobante de ingreso" }).closest("details")).toBe(documents);
    expect(screen.getByRole("link", { name: "Registrar cobro" }).getAttribute("href")).toBe("/reparaciones?rep=REP-000064");
  });
  it("links mostrador to this REP without recording a payment", () => {
    const html = renderToStaticMarkup(<OrderCoordinationPanel order={order} canManage />);
    expect(html).toContain('href="/reparaciones?rep=REP-000064"');
    expect(html).toContain("Registrar cobro");
  });
  it("keeps the collection shortcut out of the technician workflow", () => {
    const html = renderToStaticMarkup(<OrderCoordinationPanel order={order} canManage={false} />);
    expect(html).not.toContain("Registrar cobro");
    expect(html).not.toContain("/reparaciones?rep=");
  });
});

describe("coordination dialog failed pickup", () => {
  it("preserves recipient, notes and confirmations after rejection and retries the same values", async () => {
    const failure = { success: false, message: "La orden cambio. Revisa el estado antes de entregarla." };
    const action = vi.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce({ success: true, message: "Entrega registrada." });
    render(<CoordinationDialog title="Entrega del equipo" action={action} onClose={vi.fn()}>
      <input name="id" type="hidden" value={order.id} />
      <input name="version" type="hidden" value={order.workflow!.version} />
      <label>Persona que retira<input name="recipient" defaultValue={order.customer.fullName} required minLength={2} /></label>
      <label>Accesorios devueltos y observaciones<textarea name="notes" /></label>
      <label><input name="allowBalance" type="checkbox" />Autorizo entrega con saldo pendiente</label>
      <label><input name="confirmDelivery" type="checkbox" required />Confirmo que el cliente retiro el equipo</label>
    </CoordinationDialog>);
    const recipient = screen.getByLabelText("Persona que retira") as HTMLInputElement;
    const notes = screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement;
    const allowBalance = screen.getByLabelText("Autorizo entrega con saldo pendiente") as HTMLInputElement;
    const confirmDelivery = screen.getByLabelText("Confirmo que el cliente retiro el equipo") as HTMLInputElement;
    fireEvent.change(recipient, { target: { value: "Familiar autorizado" } });
    fireEvent.change(notes, { target: { value: "Cable y control. Saldo autorizado por mostrador." } });
    fireEvent.click(allowBalance);
    fireEvent.click(confirmDelivery);
    const form = screen.getByRole("button", { name: "Confirmar y guardar" }).closest("form")!;
    fireEvent.submit(form);

    expect((await screen.findByRole("alert")).textContent).toBe(failure.message);
    expect(recipient.value).toBe("Familiar autorizado");
    expect(notes.value).toBe("Cable y control. Saldo autorizado por mostrador.");
    expect(allowBalance.checked).toBe(true);
    expect(confirmDelivery.checked).toBe(true);
    expect(screen.getByRole("button", { name: "Confirmar y guardar" }).hasAttribute("disabled")).toBe(false);

    fireEvent.submit(form);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const first = action.mock.calls[0][1] as FormData;
    const retry = action.mock.calls[1][1] as FormData;
    expect(Object.fromEntries(first)).toEqual({
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), id: order.id, version: "1",
      recipient: "Familiar autorizado", notes: "Cable y control. Saldo autorizado por mostrador.",
      allowBalance: "on", confirmDelivery: "on"
    });
    expect(Object.fromEntries(retry)).toEqual(Object.fromEntries(first));
    expect(action.mock.calls[1][0]).toEqual(failure);
    expect(await screen.findByRole("button", { name: "Listo" })).toBeTruthy();
  });
});

describe("coordination dialog close protection", () => {
  it.each(["button", "escape", "backdrop"])("keeps changed fields when discarding via %s is declined", (method) => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CoordinationDialog title="Editar responsable" action={vi.fn()} onClose={onClose}>
      <label>Ubicacion<input name="location" defaultValue="Taller" /></label>
    </CoordinationDialog>);
    fireEvent.change(screen.getByRole("textbox", { name: "Ubicacion" }), { target: { value: "Estante 2" } });
    if (method === "button") fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    else if (method === "escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Ubicacion" }) as HTMLInputElement).value).toBe("Estante 2");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes without confirmation when a change was undone", () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    render(<CoordinationDialog title="Editar responsable" action={vi.fn()} onClose={onClose}>
      <label>Ubicacion<input name="location" defaultValue="Taller" /></label>
    </CoordinationDialog>);
    const input = screen.getByRole("textbox", { name: "Ubicacion" });
    fireEvent.change(input, { target: { value: "Estante 2" } });
    fireEvent.change(input, { target: { value: "Taller" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("tracks conditional part fields without treating an unchanged form as dirty", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClose = vi.fn();
    const part = { id: "part-1", status: "requested", description: "Fuente", quantity: 1,
      receivedQuantity: 0, installedQuantity: 0, version: 2, supplier: "Proveedor", expectedDate: null, unitCost: 100 } as Parameters<typeof PartManagementDialog>[0]["part"];
    render(<PartManagementDialog part={part} canManage onClose={onClose} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Accion" }), { target: { value: "cancel" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Accion" }), { target: { value: "order" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
