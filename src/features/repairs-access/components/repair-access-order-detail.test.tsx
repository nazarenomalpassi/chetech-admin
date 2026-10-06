// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RepairAccessOrderDetail } from "./repair-access-order-detail";
import type { RepairAccessOrderRecord } from "../queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../coordination-actions", () => ({ saveQuickWorkshopForm: vi.fn(), saveWorkshopForm: vi.fn() }));
vi.mock("../actions", () => ({ updateRepairAccessTechnicalAction: vi.fn() }));
vi.mock("./order-coordination-panel", () => ({ OrderCoordinationPanel: () => null }));
vi.mock("./repair-attachments", () => ({ RepairAttachments: () => null }));
vi.mock("./repair-customer-link-card", () => ({ RepairCustomerLinkCard: () => null }));
vi.mock("./repair-customer-portal-form", () => ({ RepairCustomerPortalForm: () => null }));
vi.mock("./repair-access-whatsapp-actions", () => ({ RepairAccessWhatsAppPanel: () => null }));
Object.assign(globalThis, { React });
afterEach(() => { cleanup(); localStorage.clear(); });

it("la ficha abre el editor diario y reserva el formulario administrativo para mas campos", () => {
  const order = {
    id: "10000000-0000-4000-8000-000000000001", repairNumber: "REP-000513", status: "presupuestado", intakeDate: "2026-10-06",
    issueReported: "No enciende", budgetAmount: 100, budgetDetail: "Fuente", finalAmount: 0, hasWarranty: false, warrantyDays: 0,
    customer: { fullName: "Cliente", phone: "" }, device: { deviceType: "TV" },
    workflow: { version: 1, approvalStatus: "legacy", parts: [], events: [] }
  } as unknown as RepairAccessOrderRecord;
  const { container } = render(<RepairAccessOrderDetail order={order} onBack={vi.fn()} onEditIntake={vi.fn()} defaultWarrantyDays={90} />);
  expect(screen.getByLabelText("Estado de la orden")).toBeTruthy();
  expect(screen.getByLabelText("El cliente confirmo este presupuesto")).toBeTruthy();
  expect(container.querySelector('[name="finalAmount"]')).toBeNull();
  expect(container.querySelectorAll("form[data-workshop-form]")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Mas campos administrativos" }));
  expect(screen.queryByLabelText("Estado de la orden")).toBeNull();
  expect(container.querySelector('[name="finalAmount"]')).toBeTruthy();
  expect(container.querySelectorAll("form[data-workshop-form]")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Volver al editor simple" }));
  expect(screen.getByLabelText("Estado de la orden")).toBeTruthy();
});
