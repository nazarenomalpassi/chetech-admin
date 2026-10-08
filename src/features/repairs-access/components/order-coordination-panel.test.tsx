// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
