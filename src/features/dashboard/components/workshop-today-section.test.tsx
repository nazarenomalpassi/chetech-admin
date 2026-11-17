// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { WorkshopTodaySection } from "./workshop-today-section";
import { daysSince, workshopTodaySchema, type WorkshopToday } from "../workshop-today";

Object.assign(globalThis, { React });
afterEach(cleanup);

const today: WorkshopToday = {
  asOf: "2026-11-17",
  stages: { review: 12, waitingCustomer: 5, inProgress: 2, ready: 9, toReturn: 4 },
  attention: { open: 32, over30Days: 7, blockedParts: 1 },
  oldestReady: [
    {
      id: "6f3c2f8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
      repairNumber: "REP-000101",
      intakeDate: "2026-08-01",
      readyOn: "2026-09-01",
      budgetAmount: 1000,
      finalAmount: 0,
      customerName: "Cliente de prueba",
      phone: "3510000000",
      device: "Televisor Marca Modelo"
    },
    {
      id: "7a3c2f8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
      repairNumber: "REP-000150",
      intakeDate: "2026-11-10",
      readyOn: null,
      budgetAmount: 0,
      finalAmount: 0,
      customerName: "Otra persona",
      phone: "",
      device: "Notebook"
    }
  ]
};

const visits = { todayCount: 0, pendingCount: 0, nextVisit: null };

describe("Hoy en el taller", () => {
  it("shows each stage as a link to the filtered workbench", () => {
    render(<WorkshopTodaySection canCreateOrder today={today} visits={visits} />);
    const stages = screen.getByRole("list", { name: "Equipos por etapa" });
    const ready = within(stages).getByRole("link", { name: /Listos para retirar/ });
    expect(ready.textContent).toContain("9");
    expect(ready.getAttribute("href")).toBe("/reparaciones-access?view=ordenes&scope=ready");
    expect(within(stages).getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText("32 equipos en el local.", { exact: false })).toBeTruthy();
    expect(screen.getByText("7 equipos llevan más de 30 días en el local.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 orden espera repuestos." })).toBeTruthy();
  });

  it("lists the longest waits with their days and a WhatsApp notice when there is a phone", () => {
    render(<WorkshopTodaySection canCreateOrder today={today} visits={visits} />);
    expect(screen.getByText("Listo hace 77 días")).toBeTruthy();
    expect(screen.getByText("Ingresó hace 7 días")).toBeTruthy();
    const notify = screen.getByRole("link", { name: "Avisar a Cliente de prueba por WhatsApp" });
    expect(notify.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(screen.getByText("Sin teléfono")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver los 9" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "REP-000101" }).getAttribute("href")).toBe(
      "/reparaciones-access/orden/6f3c2f8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
    );
  });

  it("offers a new order only to who can create one", () => {
    const { rerender } = render(
      <WorkshopTodaySection canCreateOrder={false} today={today} visits={visits} />
    );
    expect(screen.queryByRole("link", { name: "Nueva orden" })).toBeNull();
    rerender(<WorkshopTodaySection canCreateOrder today={today} visits={visits} />);
    expect(screen.getByRole("link", { name: "Nueva orden" }).getAttribute("href")).toBe(
      "/reparaciones-access?view=nueva"
    );
  });

  it("explains what to do when the workshop state is unavailable", () => {
    render(<WorkshopTodaySection canCreateOrder today={null} visits={visits} />);
    expect(screen.getByRole("status").textContent).toContain("No se pudo consultar");
    expect(screen.getByRole("link", { name: "Abrir la mesa de trabajo" })).toBeTruthy();
    expect(screen.getByText("Sin visitas agendadas para hoy.")).toBeTruthy();
  });

  it("validates the database answer and counts days in the shop's calendar", () => {
    expect(workshopTodaySchema.safeParse(today).success).toBe(true);
    expect(workshopTodaySchema.safeParse({ ...today, stages: {} }).success).toBe(false);
    expect(daysSince("2026-11-01", "2026-11-17")).toBe(16);
    expect(daysSince(null, "2026-11-17")).toBeNull();
    expect(daysSince("2026-11-20", "2026-11-17")).toBe(0);
  });
});
