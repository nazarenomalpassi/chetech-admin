// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WorkshopBusinessReportView } from "./components/workshop-business-report";
import { OperationalInboxSection } from "./components/operational-inbox-section";
import { reportFixture } from "./test-fixture";
Object.assign(globalThis, { React });
afterEach(cleanup);

describe("workshop business UI", () => {
  it("shows financial unknowns, actual collections, intake age and actionable real REP links", () => {
    render(<WorkshopBusinessReportView data={{ range: reportFixture, report: reportFixture, migrationReady: true }} />);
    expect(screen.getByRole("heading", { name: "Negocio del taller" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Cobrado real" })).getByText(/520/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Costo directo registrado" })).getByText("No determinable")).toBeTruthy();
    expect(screen.getByText(/No es utilidad neta/)).toBeTruthy();
    expect(screen.getByText(/No mide esperas por fase/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Repuestos pendientes/ }).getAttribute("href")).toBe("/reparaciones-access?view=ordenes&scope=parts");
    expect(screen.getByText(/sin el filtro de ingreso/)).toBeTruthy();
    expect(screen.getByLabelText("Ingreso desde").getAttribute("value")).toBe("2026-10-01");
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
