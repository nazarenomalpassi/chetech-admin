import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), missing: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
vi.mock("next/navigation", () => ({ notFound: mocks.missing }));
vi.mock("@/features/repairs-access/components/repair-label-print", () => ({ RepairLabelPrintPreview: () => null }));
Object.assign(globalThis, { React });
const id = "00000000-0000-4000-8000-000000000742";
beforeEach(() => { vi.resetAllMocks(); mocks.permission.mockResolvedValue({ role: "admin" }); mocks.missing.mockImplementation(() => { throw new Error("not found"); }); });
it("guards the preview with the same workshop read permission", async () => {
  const result = await Page({ params: Promise.resolve({ id }) });
  expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("repairs.view");
  expect(result.props.orderId).toBe(id);
});
it("does not render the preview for unauthorized sessions or invalid identifiers", async () => {
  mocks.permission.mockRejectedValueOnce(new Error("unauthorized"));
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow("unauthorized");
  await expect(Page({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("not found");
});
