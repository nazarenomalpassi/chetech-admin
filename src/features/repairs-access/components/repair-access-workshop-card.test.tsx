// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { RepairAccessWorkshopCard } from "@/features/repairs-access/components/repair-access-workshop-card";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";

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

describe("RepairAccessWorkshopCard", () => {
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
