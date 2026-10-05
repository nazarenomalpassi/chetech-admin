import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCashSettings: vi.fn(() => Promise.resolve({
    openingBalances: { efectivo: 109503, nx: 60344, mp: 10000 },
    movementCutoff: "2026-04-16T14:21:00.000Z"
  })),
  getBusinessGoals: vi.fn(() => Promise.resolve({ salesTarget: 1, profitTarget: 1, repairsTarget: 1, invoicingTarget: 1 })),
  getRepairWarrantySettings: vi.fn(() => Promise.resolve({ defaultDays: 90 }))
}));

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn(() => Promise.resolve({ role: "admin" }))
}));

vi.mock("@/lib/app-settings", () => mocks);

import ConfiguracionPage from "@/app/(admin)/configuracion/page";

Object.assign(globalThis, { React });

describe("ConfiguracionPage", () => {
  it("no expone la caja base ni consulta sus saldos para renderizar la pagina", async () => {
    const html = renderToStaticMarkup(await ConfiguracionPage({ searchParams: Promise.resolve({}) }));

    expect(html).not.toContain("Caja base");
    expect(html).not.toContain("Saldos y corte operativos");
    expect(html).not.toContain("Guardar ajustes de caja");
    expect(mocks.getCashSettings).not.toHaveBeenCalled();
    expect(html).toContain("Objetivos mensuales");
    expect(html).toContain("Garantia predeterminada");
    for (const id of ["salesTarget", "profitTarget", "repairsTarget", "invoicingTarget"]) {
      expect(html).toContain(`for="${id}"`);
    }
  });
});
