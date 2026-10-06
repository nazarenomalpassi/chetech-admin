// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), permission: vi.fn(), dashboard: vi.fn(), technician: vi.fn(), reports: vi.fn(), workshopReport: vi.fn(), inbox: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentProfile: mocks.profile, requirePermission: mocks.permission }));
vi.mock("@/features/dashboard/queries", () => ({ getDashboardData: mocks.dashboard }));
vi.mock("@/features/dashboard/technician-queries", () => ({ getTechnicianDashboardData: mocks.technician }));
vi.mock("@/features/reports/queries", () => ({ getReportsData: mocks.reports }));
vi.mock("./queries", () => ({ getWorkshopBusinessReport: mocks.workshopReport }));
vi.mock("@/features/repairs-access/coordination-queries", () => ({ getWorkshopInbox: mocks.inbox }));
vi.mock("@/features/dashboard/components/dashboard-overview", () => ({ DashboardOverview: ({ workshopInbox }: { workshopInbox?: React.ReactNode }) => <div><h1>Original admin dashboard</h1>{workshopInbox}</div> }));
vi.mock("@/features/dashboard/components/technician-dashboard", () => ({ TechnicianDashboard: ({ workshopInbox }: { workshopInbox?: React.ReactNode }) => <div><h1>Original technician dashboard</h1>{workshopInbox}</div> }));
vi.mock("@/features/reports/components/reports-view", () => ({ ReportsView: () => <div>Original reports</div> }));
import DashboardPage from "@/app/(admin)/dashboard/page";
import ReportesPage from "@/app/(admin)/reportes/page";
import { reportFixture } from "./test-fixture";
Object.assign(globalThis, { React });
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockResolvedValue({ user: { id: "tech-a" }, profile: { role: "admin", full_name: "Admin" } });
  mocks.permission.mockResolvedValue({ role: "admin" });
  mocks.dashboard.mockResolvedValue({}); mocks.technician.mockResolvedValue({}); mocks.reports.mockResolvedValue({});
  mocks.inbox.mockResolvedValue({ counts: { unassigned: 1, waitingCustomer: 2, awaitingReturn: 3, ready: 4, blockedParts: 5 }, tasks: [], technicians: [] });
  mocks.workshopReport.mockResolvedValue({ range: reportFixture, report: reportFixture, migrationReady: true });
});

describe("disjoint page integration", () => {
  it("adds the current inbox without replacing the original admin dashboard or date range", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-05" }) }));
    expect(screen.getByText("Original admin dashboard")).toBeTruthy();
    expect(screen.getByText("Bandeja del taller")).toBeTruthy();
    expect(mocks.dashboard).toHaveBeenCalledWith({ dateFrom: "2026-10-01", dateTo: "2026-10-05" });
  });
  it("allows technician operational inbox but never fetches financial report data", async () => {
    mocks.profile.mockResolvedValue({ user: { id: "tech-a" }, profile: { role: "tecnico", full_name: "Tecnico" } });
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Original technician dashboard")).toBeTruthy();
    expect(screen.getByText("Bandeja del taller")).toBeTruthy();
    expect(mocks.technician).toHaveBeenCalledWith("tech-a");
    expect(mocks.dashboard).not.toHaveBeenCalled(); expect(mocks.workshopReport).not.toHaveBeenCalled();
  });
  it("preserves ReportsView while adding the separate intake-cohort report", async () => {
    render(await ReportesPage({ searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-05" }) }));
    expect(screen.getByText("Original reports")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Negocio del taller" })).toBeTruthy();
    expect(mocks.workshopReport).toHaveBeenCalledWith("2026-10-01", "2026-10-05");
  });
});
