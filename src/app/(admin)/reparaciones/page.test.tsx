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
    expect(mocks.repairs).toHaveBeenCalledExactlyOnceWith(3, "REP-000123", undefined);
    expect(page.props.collectionTarget).toBe(target);
    expect(page.props.repairs).toBe(history);
    expect(page.key).toContain("outside-page:4");
  });
  it("forwards the payment record selected by a correction redirect", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    mocks.repairs.mockResolvedValue({ items: [], pagination: createPaginationMeta(0, 1, 25), collectionTarget: { order: null, repair: { id, financialVersion: 5 }, error: null } });
    const page = await ReparacionesPage({ searchParams: Promise.resolve({ edit: id, status: "repair_payment_reversed" }) });
    expect(mocks.repairs).toHaveBeenCalledExactlyOnceWith(1, undefined, id);
    expect(page.props.message).toMatchObject({ success: true, message: expect.stringContaining("Pago eliminado") });
    expect(page.key).toContain(`${id}:5`);
  });
});
