// @vitest-environment jsdom
import React, { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsView } from "./reports-view";

Object.assign(globalThis, { React });
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 260 } as DOMRect);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const goal = { actual: 10, target: 100, difference: -90, progress: 10 };
const data: ComponentProps<typeof ReportsView>["data"] = {
  range: { from: "2026-10-01", to: "2026-10-05", today: "2026-10-05", isToday: false, isCustomRange: true },
  metrics: { salesTotal: 1200, salesProfit: 60, repairsTotal: 500, expensesTotal: 200, invoicesTotal: 400, salariesTotal: 50, netCash: -90, salesUnknownCostCount: 2 },
  monthlyComparison: { currentLabel: "Octubre", previousLabel: "Septiembre", rows: [{ key: "expensesTotal", label: "Gastos", current: 200, previous: 100, variation: { difference: 100, percentage: 100, trend: "up" } }] },
  monthlyGoals: { label: "Octubre", goals: { sales: goal, profit: goal, repairs: goal, invoicing: goal } },
  rankings: { products: [{ label: "Placa Samsung", revenue: 1000, profit: null, quantity: 1, unknownCostCount: 1 }], categories: [{ label: "Sin producto de inventario", revenue: 1000, profit: null, quantity: 1, unknownCostCount: 1 }] },
  sellerSummary: [], technicianSummary: []
};

describe("report business overview", () => {
  it("shows zero goal-bar coverage instead of a full bar for negative progress", () => {
    const loss={actual:-20,target:100,difference:-120,progress:-20};
    render(<ReportsView canExport data={{...data,monthlyGoals:{...data.monthlyGoals,goals:{...data.monthlyGoals.goals,profit:loss}}}} />);
    const bar=screen.getByRole("progressbar",{name:/Avance de .*Margen|Avance de .*Ganancia/i});
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("0%");
  });
  it("separates recorded revenue from collections and makes unknown-cost margins explicit", () => {
    render(<ReportsView canExport data={data} />);
    expect(screen.getByText("Margen registrado de ventas")).toBeTruthy();
    expect(screen.queryByText("Ganancia bruta de ventas")).toBeNull();
    const quality = screen.getByText("Cobertura de costos de ventas").closest("details")!;
    expect(quality.open).toBe(false);
    expect(quality.querySelector("summary")?.textContent).toContain("2 ventas");
    fireEvent.click(quality.querySelector("summary")!);
    expect(quality.textContent).toContain("no se cuentan como ganancia");
    expect(screen.getByRole("figure", { name: "Actividad registrada del periodo" })).toBeTruthy();
    expect(screen.getByRole("figure", { name: "Comparacion mensual por actividad" })).toBeTruthy();
    expect(screen.getByRole("figure", { name: "Categorias con mas ventas" })).toBeTruthy();
    expect(screen.getByLabelText("Variacion de Gastos").className).toContain("text-rose-700");
    const links = screen.getAllByRole("link", { name: "Exportar CSV" });
    expect(links).toHaveLength(6);
    expect(links.every((link) => link.getAttribute("href")?.endsWith("from=2026-10-01&to=2026-10-05"))).toBe(true);
    expect(screen.getAllByText(/Margen por determinar/).length).toBeGreaterThan(0);
  });

  it("does not assume complete cost coverage when the older aggregate omits its count", () => {
    render(<ReportsView canExport={false} data={{ ...data, metrics: { ...data.metrics, salesUnknownCostCount: undefined } }} />);
    expect(screen.getByText(/Cobertura sin verificar/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Exportar CSV" })).toBeNull();
  });

  it("does not present legacy unverified ranking margins as known profit", () => {
    render(<ReportsView canExport data={{ ...data, rankings: { ...data.rankings, products: [{ label: "Placa sin costo", revenue: 1000, profit: 1000, quantity: 1 }] } }} />);
    expect(screen.getByText("Margen sin verificar; cobertura de costos no informada")).toBeTruthy();
    expect(screen.queryByText(/Margen conocido.*1.000/)).toBeNull();
  });
});
