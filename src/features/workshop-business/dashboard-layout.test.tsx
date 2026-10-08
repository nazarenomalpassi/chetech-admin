// @vitest-environment jsdom
import React, { type ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TechnicianDashboard } from "@/features/dashboard/components/technician-dashboard";
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { OperationalInboxSection } from "./components/operational-inbox-section";
Object.assign(globalThis, { React });
afterEach(cleanup);
const inbox = { counts: { unassigned: 1, waitingCustomer: 2, awaitingReturn: 3, ready: 4, blockedParts: 5 }, tasks: [], technicians: [] };
const adminData: ComponentProps<typeof DashboardOverview> = {
  salesTodayTotal: 0, expensesTodayTotal: 0, repairsTodayTotal: 0, lowStockProducts: [], accountBalances: [],
  pendingMercadoPagoReleaseAmount: 0, topProducts: [], invoiceIncomeToday: 0, realProfitToday: 0,
  installmentsDashboard: { dueTodayCount: 0, overdueCount: 0, dueTodayTotal: 0, overdueTotal: 0, dueToday: [], overdue: [] },
  visitsDashboard: { todayCount: 0, pendingCount: 0, nextVisit: null },
  range: { from: "2026-10-05", to: "2026-10-05", today: "2026-10-05", isToday: true, isCustomRange: false }
};

describe("dashboard headline and inbox placement", () => {
  it("puts technician greeting and job links before a single collapsed inbox and metrics", () => {
    render(<TechnicianDashboard technicianName="Ana" data={{
      summary: { active: 1, assigned: 1, pendingReview: 0, readyToPickup: 0 }, recentOrders: [],
      visits: { todayCount: 0, pendingCount: 0, nextVisit: null }
    }} workshopInbox={<OperationalInboxSection inbox={inbox} />} />);
    const heading = screen.getByRole("heading", { level: 1 });
    const details = screen.getByText("Bandeja del taller").closest("details")!;
    expect(heading.textContent).toContain("Ana");
    expect(heading.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir ordenes" }).compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.compareDocumentPosition(screen.getByRole("region", { name: "Resumen tecnico" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.open).toBe(false);
    expect(document.querySelectorAll("details")).toHaveLength(1);
  });
  it("puts the executive heading before the inbox without burying it after the long dashboard", () => {
    render(<DashboardOverview {...adminData} workshopInbox={<OperationalInboxSection inbox={inbox} />} />);
    const heading = screen.getByRole("heading", { level: 1 });
    const details = screen.getByText("Bandeja del taller").closest("details")!;
    expect(heading.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.compareDocumentPosition(screen.getByRole("region", { name: "Metricas del 5 oct 2026 al 5 oct 2026" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.open).toBe(false);
  });
});
