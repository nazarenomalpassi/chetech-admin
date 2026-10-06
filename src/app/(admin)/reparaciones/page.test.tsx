import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaginationMeta } from "@/lib/pagination";
const mocks = vi.hoisted(() => ({ repairs: vi.fn(), permission: vi.fn() }));
vi.mock("@/features/repairs/components/repairs-list", () => ({ RepairsList: () => null }));
vi.mock("@/features/repairs/queries", () => ({ getRepairs: mocks.repairs }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
import ReparacionesPage from "./page";

describe("Cobrar REP navigation contract", () => {
  beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); mocks.permission.mockResolvedValue({ role: "admin" }); });
  afterEach(() => vi.unstubAllGlobals());
  it("passes the REP link to the bounded loader and keeps selection separate from the current history page", async () => {
    const target = { order: { id: "native" }, repair: { id: "outside-page", financialVersion: 4 }, error: null };
    const history = [{ id: "history" }];
    mocks.repairs.mockResolvedValue({ items: history, pagination: createPaginationMeta(151, 3, 25), collectionTarget: target });
    const page = await ReparacionesPage({ searchParams: Promise.resolve({ rep: "REP-000123", page: "3" }) });
    expect(mocks.permission).toHaveBeenCalledWith("repairs.manage");
    expect(mocks.repairs).toHaveBeenCalledExactlyOnceWith(3, "REP-000123");
    expect(page.props.collectionTarget).toBe(target);
    expect(page.props.repairs).toBe(history);
    expect(page.key).toContain("outside-page:4");
  });
});
