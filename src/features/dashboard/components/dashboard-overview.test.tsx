// @vitest-environment jsdom
import React, { type ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DashboardOverview } from "./dashboard-overview";

Object.assign(globalThis, { React });
afterEach(cleanup);

const data: ComponentProps<typeof DashboardOverview> = {
  salesTodayTotal: 100, expensesTodayTotal: 20, repairsTodayTotal: 50,
  invoiceIncomeToday: 30, realProfitToday: 160, lowStockProducts: [],
  accountBalances: [{ method: "efectivo", openingBalance: 0, balance: 420 }],
  pendingMercadoPagoReleaseAmount: 90, heldMercadoPagoClaimAmount: 15,
  topProducts: [{ name: "Cable", quantity: 3 }],
  installmentsDashboard: { dueTodayCount: 2, overdueCount: 1, dueTodayTotal: 80, overdueTotal: 40, dueToday: [], overdue: [] },
  visitsDashboard: { todayCount: 3, pendingCount: 2, nextVisit: null },
  range: { from: "2026-10-01", to: "2026-10-05", today: "2026-10-05", isToday: false, isCustomRange: true }
};

describe("dashboard independent disclosures", () => {
  it("keeps all five headline KPIs outside disclosures and preserves their values", () => {
    render(<DashboardOverview {...data} />);
    const metrics = screen.getByRole("region", { name: /Metricas del/ });
    expect(metrics.closest("details")).toBeNull();
    for (const label of ["Ventas", "Gastos", "Reparaciones", "Facturacion", "Flujo neto de caja"]) {
      expect(within(metrics).getByText(label)).toBeTruthy();
    }
    expect(metrics.textContent).toMatch(/160/);
  });

  it("folds every lower panel independently with useful summaries and native controls", () => {
    const { container } = render(<DashboardOverview {...data} />);
    const labels = ["Reposicion sugerida", "Saldo disponible por cuenta", "Visitas de hoy", "Cuotas por cobrar", "Productos mas vendidos"];
    expect(container.querySelectorAll("details")).toHaveLength(labels.length);
    const panels = labels.map((label) => {
      const summary = screen.getByText(label).closest("summary")!;
      expect(summary).not.toBeNull();
      expect(summary.parentElement?.hasAttribute("name")).toBe(false);
      expect((summary.parentElement as HTMLDetailsElement).open).toBe(false);
      return summary;
    });
    expect(panels[1].textContent).toMatch(/420/);
    expect(panels[1].textContent).toMatch(/90/);
    expect(panels[2].textContent).toMatch(/3.*2 pendientes/);
    expect(panels[3].textContent).toMatch(/2.*80.*1.*40/);
    expect(panels[4].textContent).toMatch(/3 unidades/);
    fireEvent.click(panels[1]);
    fireEvent.click(panels[3]);
    expect((panels[1].parentElement as HTMLDetailsElement).open).toBe(true);
    expect((panels[3].parentElement as HTMLDetailsElement).open).toBe(true);
    fireEvent.click(panels[1]);
    expect((panels[3].parentElement as HTMLDetailsElement).open).toBe(true);
    expect(container.textContent).toContain("Saldos actuales, no del periodo filtrado.");
    expect(container.textContent).toContain("15");
  });
});
