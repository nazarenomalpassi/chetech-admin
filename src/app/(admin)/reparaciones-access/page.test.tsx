import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
const mocks = vi.hoisted(() => ({ workshop: vi.fn(), count: vi.fn(), page: vi.fn(), permission: vi.fn() }));
vi.mock("@/features/repairs-access/components/repairs-access-view", () => ({ RepairsAccessView: () => null }));
vi.mock("@/features/repairs-access/page-queries", () => ({ getRepairWorkshopPage: mocks.workshop }));
vi.mock("@/features/repairs-access/warranty-queries", () => ({ getWarrantyReturnsCount: mocks.count, getWarrantyReturnsPage: mocks.page }));
vi.mock("@/features/repairs-access/coordination-queries", () => ({ getWorkshopInbox: async () => null }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/app-settings", () => ({ getRepairWarrantySettings: async () => ({ defaultDays: 90 }) }));
Object.assign(globalThis, { React });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ role: "technician" });
  mocks.workshop.mockResolvedValue({ orders: [], customers: [], latestImport: null, summary: {}, pageInfo: {} });
  mocks.count.mockResolvedValue(6);
  mocks.page.mockResolvedValue({ items: [], total: 3, activeCount: 6, page: 2, pageSize: 30 });
});

it("loads only the global warranty count outside the warranty view", async () => {
  const element = await Page({ searchParams: Promise.resolve({ view: "ordenes", wq: "ignored", wp: "2" }) });
  expect(mocks.count).toHaveBeenCalledTimes(1);
  expect(mocks.page).not.toHaveBeenCalled();
  expect(element.props.warrantyReturnsCount).toBe(6);
  expect(element.props.warrantyReturnsPage).toBeNull();
});

it("loads warranty results with independent query parameters for technicians", async () => {
  const element = await Page({ searchParams: Promise.resolve({ view: "garantias", q: "original", wq: "TV", wp: "2", wh: "1" }) });
  expect(mocks.page).toHaveBeenCalledWith({ page: "2", search: "TV", closed: true });
  expect(element.props.canManageIntake).toBe(false);
  expect(element.props.warrantyReturnsSearch).toBe("TV");
  expect(element.props.warrantyReturnsClosed).toBe(true);
  expect(element.props.warrantyReturnsPage?.total).toBe(3);
});
