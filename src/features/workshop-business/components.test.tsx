// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WorkshopBusinessReportView } from "./components/workshop-business-report";
import { OperationalInboxSection } from "./components/operational-inbox-section";
import { reportFixture } from "./test-fixture";
Object.assign(globalThis, { React });
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 260 } as DOMRect);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("workshop business UI", () => {
  it("shows financial unknowns, actual collections, intake age and actionable real REP links", () => {
    render(<WorkshopBusinessReportView data={{ range: reportFixture, report: reportFixture, migrationReady: true }} />);
    expect(screen.getByRole("heading", { name: "Negocio del taller" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Cobrado real" })).getByText(/520/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Costo directo registrado" })).getByText("Por determinar")).toBeTruthy();
    expect(screen.getByText(/No es utilidad neta/)).toBeTruthy();
    expect(screen.getByText(/No mide esperas por fase/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Repuestos pendientes/ }).getAttribute("href")).toBe("/reparaciones-access?view=ordenes&scope=parts");
    expect(screen.getByText(/colas actuales completas/)).toBeTruthy();
    expect(screen.getByLabelText("Ingreso desde").getAttribute("value")).toBe("2026-10-01");
  });
  it("prioritizes actionable colored financial evidence and folds quality details without hiding uncertainty", () => {
    render(<WorkshopBusinessReportView data={{ range: reportFixture, report: reportFixture, migrationReady: true }} />);
    const quality = screen.getByText("Calidad y alcance de los datos").closest("details")!;
    expect(quality).not.toBeNull();
    expect(quality.open).toBe(false);
    expect(quality.querySelector("summary")?.textContent).toMatch(/2.*costos.*1.*importe/);
    const pending = screen.getByRole("group", { name: "Pendiente conocido" });
    expect(pending.textContent).toContain("Subtotal parcial");
    expect(pending.textContent).toMatch(/1.300/);
    expect(screen.queryByText("Datos incompletos")).toBeNull();
    expect(screen.getByRole("figure", { name: "Cobros, cargos y costos de la cohorte" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Margen directo registrado" }).textContent).toContain("Por determinar");
    fireEvent.click(quality.querySelector("summary")!);
    expect(quality.open).toBe(true);
    expect(screen.getByText(/marcas de pagado sin registros de pago/)).toBeTruthy();
  });
  it("makes a missing migration explicit without misleading zero KPIs", () => {
    render(<WorkshopBusinessReportView data={{ range: reportFixture, report: null, migrationReady: false }} />);
    expect(screen.getByRole("status").textContent).toMatch(/migracion de lectura/);
    expect(screen.queryByRole("group", { name: "Cobrado real" })).toBeNull();
  });
  it("reuses the operational inbox and explains its independent current-queue scope", () => {
    render(<OperationalInboxSection inbox={{ counts: { unassigned: 1, waitingCustomer: 2, awaitingReturn: 3, ready: 4, blockedParts: 5 }, tasks: [], technicians: [] }} />);
    const disclosure = screen.getByText("Bandeja del taller").closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(disclosure.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Pendientes del taller" })).toBeTruthy();
    expect(screen.getByText(/No depende del periodo financiero/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Sin responsable/ }).getAttribute("href")).toContain("scope=unassigned");
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });
  it("does not hide unavailable inbox data as zero pending work", () => {
    render(<OperationalInboxSection inbox={null} />);
    expect(screen.getByRole("status").textContent).toMatch(/Bandeja operativa no disponible/);
  });
});
