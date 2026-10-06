// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepairAccessWorkshopCard } from "@/features/repairs-access/components/repair-access-workshop-card";
import { RepairAccessOrderDetail } from "@/features/repairs-access/components/repair-access-order-detail";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

Object.assign(globalThis, { React });
afterEach(cleanup);

const order: RepairAccessOrderRecord = {
  id: "repair-1",
  repairNumber: "REP-000357",
  intakeDate: "2026-07-11",
  issueReported: "No enciende",
  technicalDiagnosis: null,
  repairProgress: null,
  budgetAmount: 0,
  budgetDetail: null,
  budgetResponseNotes: null,
  budgetResponseAt: null,
  approvedAmount: 0,
  finalAmount: 0,
  paymentMethod: "",
  paymentNotes: null,
  isPaid: false,
  paidAt: null,
  deliveredAt: null,
  pickedUpAt: null,
  hasWarranty: false,
  warrantyRequiresReview: false,
  warrantyStart: null,
  warrantyUntil: null,
  warrantyDays: 0,
  warrantyConditions: null,
  warrantyActive: false,
  warranty: {
    code: "none",
    label: "Sin garantia",
    tone: "neutral",
    startsOn: null,
    expiresOn: null,
    daysRemaining: null,
    daysElapsed: null,
    description: "Esta reparacion no tiene garantia asignada."
  },
  historicalWarrantyExpired: null,
  legacyOrderNumber: null,
  importSource: null,
  importFileName: null,
  importRowKey: null,
  importedAt: null,
  workPerformed: null,
  usedParts: null,
  internalObservations: null,
  technicianName: null,
  customerUserId: null,
  customerPublicId: null,
  publicProgress: null,
  publicNextStep: null,
  budgetVisibleToCustomer: false,
  publicBudgetDescription: null,
  budgetValidUntil: null,
  customerActionRequired: false,
  lastCustomerVisibleUpdateAt: null,
  customerPortalLinked: false,
  storefrontCustomer: null,
  notes: null,
  priority: null,
  status: "pendiente_revision",
  createdAt: "2026-07-11T12:00:00.000Z",
  customer: {
    id: "customer-1",
    fullName: "Cliente prueba",
    phone: "3571548026",
    alternatePhone: "",
    phoneNormalized: "5493571548026",
    dni: "",
    email: "",
    address: "",
    notes: ""
  },
  device: {
    id: "device-1",
    deviceType: "Televisor",
    brand: "Marca",
    model: "Modelo",
    serialNumber: "",
    accessoryDetails: "",
    visualCondition: "",
    notes: ""
  }
};

const waitingOrder: RepairAccessOrderRecord = {
  ...order, status: "presupuestado", budgetAmount: 208000, finalAmount: 208000,
  workflow: { version: 1, budgetRevision: 0, approvalStatus: "legacy", approvedAmount: null, assignedTechnicianId: null,
    assignedTechnicianName: null, location: null, nextActionDate: null, qualityCheckedAt: null, qualityNotes: null, parts: [], events: [] }
};

describe("RepairAccessWorkshopCard", () => {
  it.each([true, false])("reserva toda la fila para el REP sin que los badges lo compriman (admin=%s)", (canManageIntake) => {
    const { container } = render(<RepairAccessWorkshopCard canManageIntake={canManageIntake} onEdit={() => undefined} onOpenDetail={() => undefined} order={waitingOrder} />);
    const header = container.querySelector("article header")!;
    expect(header.className).not.toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(header.textContent).toContain(waitingOrder.repairNumber);
  });
  it("ofrece el mismo editor rapido para la cuenta admin compartida", () => {
    render(<RepairAccessWorkshopCard canManageIntake onEdit={() => undefined} onOpenDetail={() => undefined} order={waitingOrder} />);
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true; fireEvent(details, new Event("toggle"));
    expect(screen.getByLabelText("El cliente confirmo este presupuesto")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    expect(screen.getByLabelText("Presupuesto").closest("form")?.querySelectorAll('input[name="id"]').length).toBe(1);
  });
  it("explica en celular como habilitar listo para retirar sin inventar la confirmacion", () => {
    render(<RepairAccessWorkshopCard canManageIntake={false} onEdit={() => undefined} onOpenDetail={() => undefined} order={waitingOrder} />);
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true; fireEvent(details, new Event("toggle"));
    const notice = screen.getByRole("note", { name: "Antes de marcar listo para retirar" });
    expect(notice.textContent).toContain("Confirmacion del cliente pendiente");
    expect(notice.textContent).toContain("Pedile a mostrador");
    expect(notice.textContent).toContain("control de calidad");
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "listo_para_retirar" } });
    expect(screen.getByLabelText("Equipo probado y funcionando")).toBeTruthy();
  });

  it("muestra los pasos pendientes tambien en la ficha completa", () => {
    const html = renderToStaticMarkup(<RepairAccessOrderDetail order={waitingOrder} onBack={() => undefined} onEditIntake={() => undefined} defaultWarrantyDays={30} />);
    expect(html).toContain("Presupuesto, avance y estado en un solo guardado");
    expect(html).toContain("El cliente confirmo este presupuesto");
    expect(html).toContain('Cliente confirmo');
  });

  it("no presenta la utilizacion pendiente como un bloqueo de recepcion", () => {
    const readyOrder = { ...waitingOrder, workflow: { ...waitingOrder.workflow!, approvalStatus: "accepted" as const, approvedAmount: 208000,
      parts: [{ id: "part-1", orderId: order.id, description: "Fuente", quantity: 2, receivedQuantity: 2, installedQuantity: 1, status: "received" as const,
        priority: "normal", supplier: null, expectedDate: null, notes: null, unitCost: null, productId: null, version: 1, createdAt: order.createdAt }] } };
    render(<RepairAccessWorkshopCard canManageIntake={false} onEdit={() => undefined} onOpenDetail={() => undefined} order={readyOrder} />);
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true; fireEvent(details, new Event("toggle"));
    const notice = screen.getByRole("note", { name: "Antes de marcar listo para retirar" });
    expect(notice.textContent).not.toContain("Repuestos pendientes");
    expect(notice.textContent).not.toContain("Confirmacion del cliente pendiente");
  });
  it.each(["ordered", "cancelled"] as const)("refleja la guarda de recepcion para una solicitud %s", (status) => {
    const nextOrder = { ...waitingOrder, workflow: { ...waitingOrder.workflow!,
      parts: [{ id: "part-1", orderId: order.id, description: "Fuente", quantity: 2, receivedQuantity: 1, installedQuantity: 1, status,
        priority: "normal", supplier: null, expectedDate: null, notes: null, unitCost: null, productId: null, version: 1, createdAt: order.createdAt }] } };
    render(<RepairAccessWorkshopCard canManageIntake={false} onEdit={() => undefined} onOpenDetail={() => undefined} order={nextOrder} />);
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true; fireEvent(details, new Event("toggle"));
    const notice = screen.getByRole("note", { name: "Antes de marcar listo para retirar" });
    if (status === "ordered") {
      expect(notice.textContent).toContain("Repuestos pendientes de recibir");
      expect(notice.textContent).toContain("recepcion");
    } else expect(notice.textContent).not.toContain("Repuestos pendientes");
  });
  it("oculta las acciones de contacto personal del tecnico en todas las resoluciones", () => {
    const html = renderToStaticMarkup(
      <RepairAccessWorkshopCard
        canManageIntake={false}
        onEdit={() => undefined}
        onOpenDetail={() => undefined}
        order={order}
      />
    );

    expect(html).toContain('data-workshop-contact-actions="true"');
    expect(html).toMatch(/data-workshop-contact-actions="true"[^>]*class="hidden"/);
    expect(html).toContain("Portal del cliente");
    expect(html).not.toContain('name="repairAmount"');
  });

  it("conserva los contactos del negocio para mostrador en desktop", () => {
    const html = renderToStaticMarkup(<RepairAccessWorkshopCard canManageIntake onEdit={() => undefined} onOpenDetail={() => undefined} order={order} />);
    expect(html).toMatch(/data-workshop-contact-actions="true"[^>]*class="[^"]*hidden[^"]*lg:grid/);
  });

  it("carga los controles de trabajo solo al abrir la ficha y conserva las advertencias", () => {
    render(<RepairAccessWorkshopCard canManageIntake={false} onEdit={() => undefined} onOpenDetail={() => undefined} order={order} />);
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByLabelText(/^Presupuesto · visible para el cliente/)).toBeTruthy();
    expect(screen.getByLabelText("Detalle del presupuesto · visible para el cliente")).toBeTruthy();
    expect(screen.getByLabelText("Avance de reparacion · visible para el cliente")).toBeTruthy();
    const portal = screen.getByText("Portal del cliente").closest("details")!;
    portal.open = true;
    fireEvent(portal, new Event("toggle"));
    expect(screen.getByText("Esta actualización será visible para el cliente.")).toBeTruthy();
  });
});
