// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { WorkshopTodaySection } from "./workshop-today-section";
import { buildDailyCashSeries } from "../daily-cash";
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

  it("keeps the home short: no retiro list, visits in one line", () => {
    render(
      <WorkshopTodaySection
        canCreateOrder
        today={today}
        visits={{
          todayCount: 2,
          pendingCount: 1,
          nextVisit: {
            id: "v1",
            customerName: "Cliente visita",
            customerPhone: "",
            address: "",
            visitDate: "2026-11-17",
            timeFrom: "15:00",
            timeTo: "16:00",
            reason: "",
            notes: "",
            status: "pendiente",
            createdAt: "2026-11-16T10:00:00Z"
          } as never
        }}
      />
    );
    expect(screen.queryByText("Esperan retiro hace más tiempo")).toBeNull();
    expect(screen.queryByRole("link", { name: /Avisar a/ })).toBeNull();
    expect(screen.getByText(/2 visitas hoy; la próxima, Cliente visita/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir visitas" })).toBeTruthy();
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
    expect(screen.getByRole("status").textContent).toContain("no está disponible");
    expect(screen.getByRole("link", { name: "Ver pendientes" })).toBeTruthy();
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

  it("builds a continuous daily or weekly series for the chart", () => {
    const rows = [
      {
        day: "2026-11-02",
        income: 100,
        outcome: 40,
        sales: 100,
        repairs: 0,
        invoices: 0,
        expenses: 40,
        salaries: 0
      },
      {
        day: "2026-11-04",
        income: 50,
        outcome: 0,
        sales: 0,
        repairs: 50,
        invoices: 0,
        expenses: 0,
        salaries: 0
      }
    ];
    const daily = buildDailyCashSeries(rows, "2026-11-01", "2026-11-05");
    expect(daily.granularity).toBe("day");
    expect(daily.points.map((point) => point.income)).toEqual([0, 100, 0, 50, 0]);
    const weekly = buildDailyCashSeries(rows, "2026-09-01", "2026-11-30");
    expect(weekly.granularity).toBe("week");
    expect(weekly.points.find((point) => point.key === "2026-11-02")?.income).toBe(150);
  });
});
