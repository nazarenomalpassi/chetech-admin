import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  page: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
vi.mock("../../page", () => ({ default: mocks.page }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import Page from "./page";
const id = "00000000-0000-4000-8000-000000000742";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => {
    throw new Error("missing");
  });
  mocks.page.mockResolvedValue("private workshop");
});
it("rechecks staff access and reuses the existing order workspace", async () => {
  expect(await Page({ params: Promise.resolve({ id }) })).toBe(
    "private workshop",
  );
  expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("repairs.view");
  expect(await mocks.page.mock.calls[0][0].searchParams).toEqual({
    view: "detalle",
    order: id,
  });
});
it("never renders the private workspace without permission", async () => {
  mocks.permission.mockRejectedValueOnce(new Error("denied"));
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "denied",
  );
  expect(mocks.page).not.toHaveBeenCalled();
});
it("does not pass an arbitrary path through the private alias", async () => {
  await expect(
    Page({ params: Promise.resolve({ id: "//evil.test" }) }),
  ).rejects.toThrow("missing");
  expect(mocks.page).not.toHaveBeenCalled();
});
