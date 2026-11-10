// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkshopOperationalMetrics } from "./workshop-operational-metrics";
import type { WorkshopOperationalMetricsSnapshot } from "../operational-metrics";

Object.assign(globalThis, { React });
afterEach(cleanup);

export const snapshot: WorkshopOperationalMetricsSnapshot = {
  version: 1, scope: "full_workshop", asOf: "2026-11-10", snapshotAt: "2026-11-10T12:00:00Z",
  period: { from: "2026-11-01", to: "2026-11-10" },
  current: {
    openOrders: 84, waitingAuthorization: 11,
    age: { days0to7: 30, days8to14: 20, days15to30: 18, days31plus: 14, unknownIntakeOrders: 2 },
    inactivity: { thresholdDays: 7, staleOrders: 19, knownActivityOrders: 75, unknownActivityOrders: 9 },
    parts: { orders: 13, requests: 20, unitsToPurchase: 15, unitsInTransit: 7, unitsToReceive: 22 },
    ready: { orders: 9, datedOrders: 6, unknownDateOrders: 3, medianWaitDays: 4.5, oldestWaitDays: 12 }
  },
  periodFlow: { intakes: 31, closures: 24, closuresMissingDate: 2, days: [{ date: "2026-11-01", intakes: 4, closures: 3 }] },
  warranty: { activeReturns: 3, openedInPeriod: 4, closedInPeriod: 2, uniqueOrdersInPeriod: 3,
    matureCohort: { maturedOrders: 8, returnedOrders: 2, comparableOrders: null, returnRate: null, reason: "No hay inicio verificado de observacion continua." } },
  phaseDurations: [{ status: "en_revision", samples: 4, orders: 3, medianDays: 2.5 }],
  quality: { reconstructedStatusEvents: 10, ambiguousStatusEvents: 1, invalidStatusIntervals: 2 },
  methodology: { warrantyObservationFrom: null }
};

describe("workshop operational metrics", () => {
  it("clearly distinguishes unavailable metrics from a workshop with zero orders", () => {
    render(<WorkshopOperationalMetrics metrics={null} />);
    expect(screen.getByRole("status").textContent).toMatch(/no disponibles/i);
    expect(screen.queryByText("0")).toBeNull();
  });
  it("uses the complete snapshot and distinguishes current custody from the period flow", () => {
    render(<WorkshopOperationalMetrics metrics={snapshot} />);
    expect(screen.getByRole("heading", { name: /metricas operativas/i })).toBeTruthy();
    expect(screen.getByText("84")).toBeTruthy();
    expect(screen.getByText(/todas las ordenes/i)).toBeTruthy();
    const flow = screen.getByRole("region", { name: /movimiento del periodo/i });
    expect(within(flow).getByText("31")).toBeTruthy();
    expect(within(flow).getByText("24")).toBeTruthy();
    expect(flow.textContent).toContain("01/11/2026");
    expect(flow.textContent).toContain("10/11/2026");
  });
  it("exposes unknown dates, actual samples and the real activity definition", () => {
    render(<WorkshopOperationalMetrics metrics={snapshot} />);
    expect(screen.getByText(/9 ordenes sin actividad verificable/i)).toBeTruthy();
    expect(screen.getByText(/3 equipos sin fecha de listo verificable/i)).toBeTruthy();
    expect(screen.getByText(/no se usa la ultima edicion de la ficha/i)).toBeTruthy();
    expect(screen.getByText(/4 intervalos.*3 ordenes/i)).toBeTruthy();
    expect(screen.getByText(/10 eventos reconstruidos/i)).toBeTruthy();
  });
  it("shows missing medians and warranty rates as unknown, not zero or estimated profit", () => {
    render(<WorkshopOperationalMetrics metrics={{ ...snapshot, phaseDurations: [], current: { ...snapshot.current, ready: { orders: 0, datedOrders: 0, unknownDateOrders: 0, medianWaitDays: null, oldestWaitDays: null } } }} />);
    expect(screen.getByText(/sin intervalos de estados verificables/i)).toBeTruthy();
    expect(screen.getByText(/No hay inicio verificado/i)).toBeTruthy();
    expect(screen.queryByText("0 %")).toBeNull();
    expect(screen.queryByText(/ganancia|productividad|escaneos/i)).toBeNull();
    expect(screen.getByRole("group", { name: "Listos sin retirar" }).textContent).toMatch(/Espera mediana: Sin muestra/);
  });
  it("counts repair-part units separately from unique orders and keeps warranty history separate", () => {
    render(<WorkshopOperationalMetrics metrics={snapshot} />);
    const parts = screen.getByRole("region", { name: /repuestos pendientes/i });
    expect(parts.textContent).toMatch(/13 ordenes[\s\S]*20 solicitudes/);
    expect(parts.textContent).toMatch(/15[\s\S]*por comprar/);
    const warranty = screen.getByRole("region", { name: /reingresos por garantia/i });
    expect(warranty.textContent).toMatch(/4[\s\S]*Ingresos/);
    expect(warranty.textContent).toMatch(/3 ordenes distintas/);
    expect(warranty.textContent).toMatch(/8[\s\S]*maduras[\s\S]*2[\s\S]*reingresos registrados/);
  });
  it("keeps the longest pickup wait with ready equipment, not with parts purchasing", () => {
    render(<WorkshopOperationalMetrics metrics={snapshot} />);
    expect(screen.getByRole("group", { name: "Listos sin retirar" }).textContent).toMatch(/mayor espera: 12 dias/i);
    expect(screen.getByRole("region", { name: /repuestos pendientes/i }).textContent).not.toMatch(/espera de retiro/i);
  });
});
