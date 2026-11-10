// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RepairLabelPrintLink, RepairLabelPrintPreview } from "./repair-label-print";
Object.assign(globalThis, { React });
const id = "00000000-0000-4000-8000-000000000742";
const fetchMock = vi.fn();
const revoke = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:label"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true });
  fetchMock.mockResolvedValue({ ok: true, headers: new Headers({ "Content-Type": "application/pdf" }), blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("offers native new-tab print/reprint links without posting a form or modifying an order", () => {
  const { rerender } = render(<RepairLabelPrintLink orderId={id} />);
  let link = screen.getByRole("link", { name: "Imprimir etiqueta" });
  expect(link.getAttribute("href")).toBe(`/reparaciones-access/etiqueta/${id}`);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toContain("noopener");
  rerender(<RepairLabelPrintLink orderId={id} reprint />);
  link = screen.getByRole("link", { name: "Reimprimir etiqueta" });
  expect(link.getAttribute("href")).toBe(`/reparaciones-access/etiqueta/${id}`);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("loads only the private saved PDF, prints its frame once, and allows reprinting", async () => {
  const { unmount } = render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  const print = vi.fn();
  const focus = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { print, focus }, configurable: true });
  await act(async () => { fireEvent.load(iframe); });
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  fireEvent.load(iframe);
  expect(print).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
  expect(print).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/repair-access/labels/${id}`, expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(screen.getByText(/100%/)).toBeTruthy();
  expect(screen.queryByText(/impresa correctamente/i)).toBeNull();
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:label");
});

it.each([403, 404, 500])("does not print error pages (%s) and offers retry", async (status) => {
  fetchMock.mockResolvedValueOnce({ ok: false, status, headers: new Headers({ "Content-Type": "application/json" }) });
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByTitle("Vista previa de la etiqueta de taller")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
});

it("rejects an expired-session HTML response rather than printing the login page", async () => {
  fetchMock.mockResolvedValue({ ok: true, headers: new Headers({ "Content-Type": "text/html" }) });
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByTitle("Vista previa de la etiqueta de taller")).toBeNull();
});

it("cancels automatic printing when the user prints before its timer finishes", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  const print = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { print, focus: vi.fn() }, configurable: true });
  fireEvent.load(iframe);
  fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
  expect(print).toHaveBeenCalledTimes(1);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  expect(print).toHaveBeenCalledTimes(1);
});

it("clears pending automatic printing when the preview unmounts", async () => {
  const { unmount } = render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  const print = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { print, focus: vi.fn() }, configurable: true });
  fireEvent.load(iframe);
  unmount();
  await new Promise(resolve => setTimeout(resolve, 450));
  expect(print).not.toHaveBeenCalled();
});

it("offers the direct PDF fallback when the browser denies frame printing", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  Object.defineProperty(iframe, "contentWindow", { value: { focus: vi.fn(), print: () => { throw new Error("Denied"); } }, configurable: true });
  fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
  expect(screen.getByRole("status").textContent).toContain("Usa Abrir PDF");
  expect(screen.getByRole("link", { name: "Abrir PDF" }).getAttribute("href")).toBe(`/api/repair-access/labels/${id}`);
});
