// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TvBoardRow } from "../model";
import { BoardTable } from "./board-table";
import { formatCurrency } from "@/lib/utils";

Object.assign(globalThis, { React });
const mocks = vi.hoisted(() => ({ release: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/tv-boards/actions", () => ({ markTvBoardReleasedAction: mocks.release, deleteTvBoardAction: vi.fn(), toggleTvBoardStatusAction: vi.fn() }));
vi.mock("@/features/tv-boards/claim-actions", () => ({ refreshTvBoardSaleStateAction: mocks.refresh }));

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  mocks.release.mockResolvedValue({ success: false, message: "No se pudo verificar el registro" });
  mocks.refresh.mockResolvedValue({ success: true, message: "Estado actualizado", state: { id: "board-1", version: 4, status: "pending_release" } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });

const board: TvBoardRow = {
  id: "board-1", brand: "LG", model: "Smart", boardType: "main", price: 150000, acquisitionCost: null,
  isActive: false, isSold: true, soldAt: "2026-10-01", netAmount: 104000.25, releaseDate: "2026-10-20",
  releasedAt: null, saleNotes: null, saleStatus: "pending_release", releaseEvidence: "estimated_due",
  claimStatus: "none", claimOpenedAt: null, claimNotes: null, claimResolvedAt: null, claimResolutionNotes: null,
  version: 3, events: [], createdAt: "2026-10-01", updatedAt: "2026-10-01"
};

function openDialog(input = board) {
  render(<BoardTable boards={[input]} canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} />);
  const trigger = screen.getAllByRole("button", { name: "Confirmar liberacion" })[0];
  trigger.focus();
  fireEvent.click(trigger);
  return { dialog: screen.getByRole("dialog", { name: "Confirmar liberacion" }), trigger };
}

function confirm(dialog: HTMLElement, method: "nx" | "mp" = "nx") {
  fireEvent.change(within(dialog).getByLabelText("Cuenta de destino"), { target: { value: method } });
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.submit(dialog.querySelector("form")!);
}

async function waitUntilReady(dialog: HTMLElement) {
  await waitFor(() => expect(dialog.querySelector("form")?.getAttribute("aria-busy")).toBe("false"));
}

it("starts without a destination, shows the read-only net, and describes the one-sale posting", () => {
  const { dialog } = openDialog();
  expect((within(dialog).getByLabelText("Cuenta de destino") as HTMLSelectElement).value).toBe("");
  expect(within(dialog).getByRole("option", { name: "NX SANTI" }).getAttribute("value")).toBe("nx");
  expect(within(dialog).getByRole("option", { name: "NX LOCAL" }).getAttribute("value")).toBe("mp");
  const net = within(dialog).getByLabelText("Neto a registrar") as HTMLInputElement;
  expect(net.readOnly).toBe(true);
  expect(net.value).toBe(formatCurrency(104000.25));
  expect(dialog.textContent).toMatch(/una venta numerada/i);
  expect(dialog.textContent).toMatch(/movimiento de caja/i);
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(mocks.release).not.toHaveBeenCalled();
});

it("focuses inline validation errors for missing account and transfer confirmation", () => {
  const { dialog } = openDialog();
  const account = within(dialog).getByLabelText("Cuenta de destino");
  fireEvent.submit(dialog.querySelector("form")!);
  expect(account.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(account);
  expect(within(dialog).getByRole("alert").textContent).toMatch(/cuenta/i);
  fireEvent.change(account, { target: { value: "mp" } });
  fireEvent.submit(dialog.querySelector("form")!);
  const checkbox = within(dialog).getByRole("checkbox");
  expect(checkbox.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(checkbox);
  expect(mocks.release).not.toHaveBeenCalled();
});

it.each(["nx", "mp"] as const)("submits only the exact board command to %s, never a client-supplied amount", async (method) => {
  const { dialog } = openDialog();
  confirm(dialog, method);
  await waitFor(() => expect(mocks.release).toHaveBeenCalledOnce());
  expect(mocks.release).toHaveBeenCalledWith({ id: board.id, version: 3, operationId: expect.any(String), method });
  await screen.findByRole("alert");
});

it("reuses a receipt key for uncertain retries, changes it per account, and recovers it after reopening", async () => {
  mocks.release.mockRejectedValue(new Error("Lost response"));
  const { dialog, trigger } = openDialog();
  confirm(dialog, "mp");
  await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toMatch(/reintenta sin cambiar/i));
  await waitUntilReady(dialog);
  const first = mocks.release.mock.calls[0][0];
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(mocks.release).toHaveBeenCalledTimes(2));
  await waitUntilReady(dialog);
  expect(mocks.release.mock.calls[1][0]).toEqual(first);
  confirm(dialog, "nx");
  await waitFor(() => expect(mocks.release).toHaveBeenCalledTimes(3));
  await waitUntilReady(dialog);
  expect(mocks.release.mock.calls[2][0].operationId).not.toBe(first.operationId);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  const reopened = screen.getByRole("dialog");
  confirm(reopened, "mp");
  await waitFor(() => expect(mocks.release).toHaveBeenCalledTimes(4));
  expect(mocks.release.mock.calls[3][0]).toEqual(first);
  await screen.findByRole("alert");
});

it("prevents duplicate submission, account changes, cancellation and Escape while pending", async () => {
  let finish!: (value: { success: boolean; message: string }) => void;
  mocks.release.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { dialog } = openDialog();
  confirm(dialog);
  fireEvent.submit(dialog.querySelector("form")!);
  expect(mocks.release).toHaveBeenCalledOnce();
  expect((within(dialog).getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(dialog).getByLabelText("Cuenta de destino") as HTMLSelectElement).disabled).toBe(true);
  expect(dialog.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBe(dialog);
  fireEvent.mouseDown(dialog.parentElement!);
  expect(screen.getByRole("dialog")).toBe(dialog);
  await act(async () => { finish({ success: true, message: "Venta V-0123 creada en NX SANTI" }); });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("V-0123");
  expect(screen.queryByRole("button", { name: "Confirmar liberacion" })).toBeNull();
});

it("blocks stale retries until an explicit read refresh and requires transfer confirmation again", async () => {
  mocks.release.mockResolvedValue({ success: false, conflict: true, message: "La placa cambio" });
  const { dialog } = openDialog();
  confirm(dialog, "mp");
  await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe("La placa cambio"));
  await waitUntilReady(dialog);
  fireEvent.submit(dialog.querySelector("form")!);
  expect(mocks.release).toHaveBeenCalledOnce();
  fireEvent.click(within(dialog).getByRole("button", { name: "Actualizar estado" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(board.id));
  await waitFor(() => expect((within(dialog).getByRole("checkbox") as HTMLInputElement).checked).toBe(false));
  await waitUntilReady(dialog);
  expect((within(dialog).getByLabelText("Cuenta de destino") as HTMLSelectElement).value).toBe("mp");
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(mocks.release).toHaveBeenCalledTimes(2));
  expect(mocks.release.mock.calls[1][0]).toMatchObject({ version: 4, method: "mp" });
  expect(mocks.release.mock.calls[1][0].operationId).not.toBe(mocks.release.mock.calls[0][0].operationId);
  await screen.findByRole("alert");
});

it.each([null, Number.NaN, -1])("does not turn an invalid net (%s) into a zero-value posting", (netAmount) => {
  const { dialog } = openDialog({ ...board, netAmount });
  confirm(dialog);
  expect(mocks.release).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("alert").textContent).toMatch(/neto/i);
});

it.each(["nx", "mp"] as const)("rejects a known zero net without posting to %s, including forced form submission", (method) => {
  const { dialog } = openDialog({ ...board, netAmount: 0 });
  expect((within(dialog).getByLabelText("Neto a registrar") as HTMLInputElement).value).toBe(formatCurrency(0));
  expect((within(dialog).getByRole("button", { name: "Confirmar y registrar venta" }) as HTMLButtonElement).disabled).toBe(true);
  confirm(dialog, method);
  expect(mocks.release).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("alert").textContent).toMatch(/neto.*mayor que cero/i);
});

it("allows the smallest positive cent amount", async () => {
  const { dialog } = openDialog({ ...board, netAmount: 0.01 });
  expect((within(dialog).getByRole("button", { name: "Confirmar y registrar venta" }) as HTMLButtonElement).disabled).toBe(false);
  confirm(dialog);
  await waitFor(() => expect(mocks.release).toHaveBeenCalledOnce());
  await waitUntilReady(dialog);
});

it("leaves cancellation free of mutations", () => {
  const { trigger } = openDialog();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(mocks.release).not.toHaveBeenCalled();
});

it("keeps keyboard focus inside the modal and restores it on backdrop cancellation", () => {
  const { dialog, trigger } = openDialog();
  const close = within(dialog).getByRole("button", { name: "Cerrar liberacion" });
  const submit = within(dialog).getByRole("button", { name: "Confirmar y registrar venta" });
  close.focus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(submit);
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(close);
  fireEvent.mouseDown(dialog.parentElement!);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(mocks.release).not.toHaveBeenCalled();
});

it.each(["released", "claim_open", "cancelled"] as const)("does not post when refresh finds the board %s", async (status) => {
  mocks.release.mockResolvedValue({ success: false, conflict: true, message: "La placa cambio" });
  mocks.refresh.mockResolvedValue({ success: true, state: { id: board.id, version: 4, status } });
  const { dialog } = openDialog();
  confirm(dialog);
  await screen.findByRole("alert");
  await waitUntilReady(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Actualizar estado" }));
  await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toMatch(/ya no esta pendiente/i));
  await waitUntilReady(dialog);
  fireEvent.submit(dialog.querySelector("form")!);
  expect(mocks.release).toHaveBeenCalledOnce();
});
