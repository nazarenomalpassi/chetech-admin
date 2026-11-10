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

it("loads one private preview and prints only on an explicit click, including reprinting", async () => {
  const { unmount } = render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  const print = vi.fn();
  const focus = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { print, focus }, configurable: true });
  await act(async () => { fireEvent.load(iframe); });
  fireEvent.load(iframe);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  expect(print).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
  expect(print).toHaveBeenCalledTimes(1);
  fireEvent.load(iframe);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
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

it("does not schedule another print after a manual print", async () => {
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

it("does not print after the preview unmounts", async () => {
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

it("offers three label variants and posts accessory details privately only after preparing the preview", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const selector = screen.getByRole("combobox", { name: "Tipo de etiqueta" });
  expect(Array.from((selector as HTMLSelectElement).options).map(option => option.text)).toEqual(["Equipo", "Accesorio", "Reingreso de garantia"]);
  const originalSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  fireEvent.change(selector, { target: { value: "accessory" } });
  expect(originalSignal.aborted).toBe(true);
  expect(screen.queryByTitle("Vista previa de la etiqueta de taller")).toBeNull();
  expect(screen.queryByRole("link", { name: "Abrir PDF" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Descripcion del accesorio" }), { target: { value: "Control remoto negro" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Numero de accesorio" }), { target: { value: "2" } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Preparar etiqueta de accesorio" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, options] = fetchMock.mock.calls[1];
  expect(url).toBe(`/api/repair-access/labels/${id}`);
  expect(options).toEqual(expect.objectContaining({ method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" } }));
  expect(JSON.parse(options.body)).toEqual({ variant: "accessory", accessoryDescription: "Control remoto negro", accessoryIndex: 2 });
  await waitFor(() => expect(screen.getByRole("link", { name: "Descargar PDF" })).toBeTruthy());
  const download = screen.getByRole("link", { name: "Descargar PDF" });
  expect(download.getAttribute("href")).toBe("blob:label");
  expect(download.getAttribute("download")).toContain("accesorio-A2");
  expect(screen.queryByText(/impresa correctamente/i)).toBeNull();
});

it("posts warranty preview selection without sending a fault or customer information in the URL", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: "warranty" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls[1][0]).toBe(`/api/repair-access/labels/${id}`);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ variant: "warranty" });
  await waitFor(() => expect(screen.getByRole("link", { name: "Descargar PDF" })).toBeTruthy());
});

it("shows the no-active-return response without falling back to the original equipment PDF", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  fetchMock.mockResolvedValueOnce({ ok: false, status: 409, headers: new Headers({ "Content-Type": "application/json" }), json: async () => ({ error: "Esta orden no tiene un reingreso de garantia activo." }) });
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: "warranty" } });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("reingreso de garantia activo"));
  expect(screen.queryByRole("link", { name: "Abrir PDF" })).toBeNull();
  expect(screen.queryByTitle("Vista previa de la etiqueta de taller")).toBeNull();
});

it("revokes the old blob without printing when changing variants", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  const print = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { focus: vi.fn(), print }, configurable: true });
  fireEvent.load(iframe);
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: "accessory" } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  expect(print).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledWith("blob:label");
});

it("does not replace a newer variant with a late, aborted PDF response", async () => {
  let resolveOld!: (value: unknown) => void;
  fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const create = vi.mocked(URL.createObjectURL);
  render(<RepairLabelPrintPreview orderId={id} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: "warranty" } });
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  await act(async () => { resolveOld({ ok: true, headers: new Headers({ "Content-Type": "application/pdf" }), blob: async () => new Blob(["stale"]) }); });
  expect(create).toHaveBeenCalledTimes(1);
});

it("invalidates the prepared accessory when its text changes and offers its own PDF fallback", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: "accessory" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Descripcion del accesorio" }), { target: { value: "Control" } });
  fireEvent.click(screen.getByRole("button", { name: "Preparar etiqueta de accesorio" }));
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  Object.defineProperty(iframe, "contentWindow", { value: { focus: vi.fn(), print: () => { throw new Error("Denied"); } }, configurable: true });
  fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
  expect(screen.getByRole("status").textContent).toContain("Usa Descargar PDF");
  fireEvent.change(screen.getByRole("textbox", { name: "Descripcion del accesorio" }), { target: { value: "Otro accesorio" } });
  expect(screen.queryByTitle("Vista previa de la etiqueta de taller")).toBeNull();
  expect((screen.getByRole("button", { name: "Imprimir etiqueta" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("link", { name: "Descargar PDF" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("returns from a warranty label to the unchanged equipment GET", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const selector = screen.getByRole("combobox", { name: "Tipo de etiqueta" });
  fireEvent.change(selector, { target: { value: "warranty" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  fireEvent.change(selector, { target: { value: "equipment" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(fetchMock.mock.calls[2][1].method).toBeUndefined();
  expect(fetchMock.mock.calls[2][1].body).toBeUndefined();
  expect(screen.getByRole("link", { name: "Abrir PDF" }).getAttribute("href")).toBe(`/api/repair-access/labels/${id}`);
});

it.each(["accessory", "warranty"])("does not print a newly selected %s variant until the operator clicks", async variant => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: variant } });
  if (variant === "accessory") {
    fireEvent.change(screen.getByRole("textbox", { name: "Descripcion del accesorio" }), { target: { value: "Control" } });
    fireEvent.click(screen.getByRole("button", { name: "Preparar etiqueta de accesorio" }));
  }
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  const iframe = screen.getByTitle("Vista previa de la etiqueta de taller") as HTMLIFrameElement;
  const print = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { print, focus: vi.fn() }, configurable: true });
  fireEvent.load(iframe);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  expect(print).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
  expect(print).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("limits temporary accessory input to 120 characters and warns only when the renderer actually crops it", async () => {
  render(<RepairLabelPrintPreview orderId={id} />);
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de etiqueta" }), { target: { value: "accessory" } });
  const input = screen.getByRole("textbox", { name: "Descripcion del accesorio" }) as HTMLInputElement;
  expect(input.maxLength).toBe(120);
  fireEvent.change(input, { target: { value: "Descripcion temporal muy larga ".repeat(3) } });
  fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers({ "Content-Type": "application/pdf", "X-CHETECH-Accessory-Truncated": "1" }), blob: async () => new Blob(["%PDF"]) });
  fireEvent.click(screen.getByRole("button", { name: "Preparar etiqueta de accesorio" }));
  await waitFor(() => expect(screen.getByRole("note", { name: "Descripcion del accesorio recortada" })).toBeTruthy());
  expect(screen.getByRole("note").textContent).toMatch(/acorta/i);
  expect(screen.getByRole("note").textContent).toContain("El QR no recupera este texto temporal");
  fireEvent.change(input, { target: { value: "Control" } });
  expect(screen.queryByRole("note")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Preparar etiqueta de accesorio" }));
  await waitFor(() => expect(screen.getByTitle("Vista previa de la etiqueta de taller")).toBeTruthy());
  expect(screen.queryByRole("note")).toBeNull();
});
