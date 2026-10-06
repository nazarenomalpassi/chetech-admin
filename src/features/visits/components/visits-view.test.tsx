// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisitsView } from "./visits-view";
Object.assign(globalThis, { React });
vi.mock("@/features/visits/actions", () => ({ saveVisitAction: vi.fn(), updateVisitStatusAction: vi.fn(), deleteVisitAction: vi.fn() }));
afterEach(cleanup);
describe("visit assignment form and filters", () => {
  it("exposes labelled assignment, REP and calendar controls and keeps filters on save", () => {
    const { container } = render(<VisitsView canManage canDelete data={{ migrationReady: true, today: "2026-10-05", technicians: [{ id: "tech", full_name: "Juan" }], filters: { search: "cliente", status: "confirmada", date: "2026-10-05", view: "week", technicianId: "tech" }, visits: [], summary: { todayCount: 0, pendingTodayCount: 0, openCount: 0, upcomingCount: 0, nextVisit: null } }} message={null} />);
    expect(screen.getByRole("combobox", { name: "Tecnico asignado" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "REP vinculada (opcional)" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Nombre del cliente" })).toBeTruthy();
    expect(screen.getByLabelText("Fecha")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Vista de agenda" }) as HTMLSelectElement).value).toBe("week");
    expect((container.querySelector('input[name="returnTo"]') as HTMLInputElement).value).toContain("view=week&technicianId=tech");
  });
});
