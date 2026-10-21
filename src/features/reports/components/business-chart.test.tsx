// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessChart } from "./business-chart";

Object.assign(globalThis, { React });
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 260 } as DOMRect);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("business chart evidence", () => {
  it("keeps unknowns distinct from explicit zeros and negative margins in the data table", () => {
    render(<BusinessChart title="Importes de la cohorte" description="No sumar cobros y cargos." rows={[
      { label: "Cobrado", value: 520, tone: "income" },
      { label: "Costo", value: null, tone: "expense" },
      { label: "Margen", value: -20, tone: "margin" },
      { label: "Gratuito", value: 0, tone: "neutral" }
    ]} />);
    fireEvent.click(screen.getByText("Ver tabla de datos"));
    const table = screen.getByRole("table", { name: "Datos de Importes de la cohorte" });
    expect(within(table).getByRole("row", { name: /Costo/ }).textContent).toContain("Por determinar");
    expect(within(table).getByRole("row", { name: /Gratuito/ }).textContent).not.toContain("Por determinar");
    expect(within(table).getByRole("row", { name: /Margen/ }).textContent).toMatch(/-.*20/);
    expect(screen.getByRole("figure", { name: "Importes de la cohorte" })).toBeTruthy();
    expect(document.querySelector(".recharts-bar-rectangle")).not.toBeNull();
  });

  it("shows an honest empty state without losing its accessible table", () => {
    render(<BusinessChart title="Sin actividad" description="Periodo elegido" rows={[]} />);
    expect(screen.getByRole("status").textContent).toContain("No hay registros para este grafico");
    fireEvent.click(screen.getByText("Ver tabla de datos"));
    expect(screen.getByRole("table", { name: "Datos de Sin actividad" })).toBeTruthy();
  });

  it("labels both comparison periods instead of inventing a trend for the selected range", () => {
    render(<BusinessChart title="Comparacion mensual" description="Independiente del rango" valueLabel="Octubre" previousLabel="Septiembre" rows={[
      { label: "Gastos", value: 200, previous: 150, tone: "expense" }
    ]} />);
    fireEvent.click(screen.getByText("Ver tabla de datos"));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Octubre" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Septiembre" })).toBeTruthy();
  });
});
