// @vitest-environment jsdom
import React, { type ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TechnicianDashboard } from "@/features/dashboard/components/technician-dashboard";
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { OperationalInboxSection } from "./components/operational-inbox-section";
Object.assign(globalThis, { React });
afterEach(cleanup);
const inbox = {
  counts: { unassigned: 1, waitingCustomer: 2, awaitingReturn: 3, ready: 4, blockedParts: 5 },
  tasks: [],
  technicians: []
};
const adminData: ComponentProps<typeof DashboardOverview> = {
  salesTodayTotal: 0,
  expensesTodayTotal: 0,
  repairsTodayTotal: 0,
  lowStockProducts: [],
  accountBalances: [],
  pendingMercadoPagoReleaseAmount: 0,
  topProducts: [],
  invoiceIncomeToday: 0,
  realProfitToday: 0,
  visitsDashboard: { todayCount: 0, pendingCount: 0, nextVisit: null },
  range: {
    from: "2026-10-05",
    to: "2026-10-05",
    today: "2026-10-05",
    isToday: true,
    isCustomRange: false
  }
};

describe("dashboard headline and inbox placement", () => {
  it("puts the workshop first, then the collapsed inbox, then the technician's own work", () => {
    render(
      <TechnicianDashboard
        technicianName="Ana"
        data={{
          summary: { active: 1, assigned: 1, pendingReview: 0, readyToPickup: 0 },
          recentOrders: [],
          visits: { todayCount: 0, pendingCount: 0, nextVisit: null }
        }}
        workshopInbox={<OperationalInboxSection inbox={inbox} />}
        workshopToday={<h1>Hoy en el taller</h1>}
      />
    );
    const heading = screen.getByRole("heading", { level: 1 });
    const details = screen.getByText("Bandeja del taller").closest("details")!;
    const own = screen.getByRole("heading", { level: 2, name: "Tu trabajo, Ana" });
    expect(
      heading.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(details.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.open).toBe(false);
    expect(screen.getByText("1 orden asignada a vos.")).toBeTruthy();
    expect(screen.getByText("No hay órdenes activas para mostrar.")).toBeTruthy();
  });
  it("puts the executive heading before the inbox without burying it after the long dashboard", () => {
    render(
      <DashboardOverview
        {...adminData}
        workshopInbox={<OperationalInboxSection inbox={inbox} />}
        workshopToday={<h1>Hoy en el taller</h1>}
      />
    );
    const heading = screen.getByRole("heading", { level: 1 });
    const details = screen.getByText("Bandeja del taller").closest("details")!;
    expect(
      heading.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      details.compareDocumentPosition(
        screen.getByRole("region", { name: "Métricas del 5 oct 2026 al 5 oct 2026" })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(details.open).toBe(false);
  });
});
