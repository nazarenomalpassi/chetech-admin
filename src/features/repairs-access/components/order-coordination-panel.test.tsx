// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RepairAccessOrderRecord } from "../queries";
import { OrderCoordinationPanel } from "./order-coordination-panel";

Object.assign(globalThis, { React });
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
