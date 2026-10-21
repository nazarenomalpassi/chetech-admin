// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepairAccessOrderRecord } from "../queries";
import { RepairDocumentShareActions } from "./repair-document-share-actions";

Object.assign(globalThis, { React });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const intakeLabel = "Enviar comprobante de ingreso";
const deliveryLabel = "Enviar pago y garant\u00eda";
const order = {
  id: "10000000-0000-4000-8000-000000000001", status: "pendiente_revision",
  pickedUpAt: null, deliveredAt: null,
  customer: { fullName: "Cliente Ejemplo", phone: "3571 573744", alternatePhone: "" }
} as RepairAccessOrderRecord;

function openSharedLinks() {
  fireEvent.click(screen.getByText("Enlaces compartidos"));
}

describe("manual repair receipt sharing", () => {
  it("uses only a native POST form with the exact new-tab contract and no popup or send request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const popup = vi.spyOn(window, "open");
    const { container } = render(<RepairDocumentShareActions order={order} canManageIntake />);
    const button = screen.getByRole("button", { name: intakeLabel }) as HTMLButtonElement;
    const form = button.closest("form")!;
    expect(button.type).toBe("submit");
    expect(button.disabled).toBe(false);
    expect(button.className).toContain("min-h-11");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/repair-access/document-shares");
    expect(form.getAttribute("target")).toBe("_blank");
    expect(form.getAttribute("rel")).toBe("noopener");
    expect(Object.fromEntries(new FormData(form))).toEqual({ orderId: order.id, kind: "intake", intent: "send" });
    expect(form.parentElement?.closest("form")).toBeNull();
    expect(button.closest("details")).toBeNull();
    expect(container.querySelector('a[href*="whatsapp"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();
  });

  it.each([
    { pickedUpAt: "2026-10-21T12:00:00Z", deliveredAt: null },
    { pickedUpAt: null, deliveredAt: "2026-10-21T12:00:00Z" }
  ])("offers the payment/warranty form only after a saved pickup timestamp: %j", (dates) => {
    render(<RepairDocumentShareActions order={{ ...order, ...dates }} canManageIntake />);
    const button = screen.getByRole("button", { name: deliveryLabel });
    expect(Object.fromEntries(new FormData(button.closest("form")!))).toEqual({ orderId: order.id, kind: "delivery", intent: "send" });
    expect(button.closest("details")).toBeNull();
  });

  it("does not infer a pickup or payment from the retired status", () => {
    const retiredOrder = { ...order, status: "retirado" };
    render(<RepairDocumentShareActions order={retiredOrder} canManageIntake />);
    expect(screen.queryByRole("button", { name: deliveryLabel })).toBeNull();
    openSharedLinks();
    expect(screen.queryByRole("button", { name: /Cancelar enlaces de pago/ })).toBeNull();
  });

  it("hides all share and revoke controls from technicians", () => {
    const { container } = render(<RepairDocumentShareActions order={order} canManageIntake={false} />);
    expect(container.innerHTML).toBe("");
  });

  it.each(["", "123", "549357157374455", "54357157374455"])("disables send and explains an invalid primary phone (%s)", (phone) => {
    render(<RepairDocumentShareActions order={{ ...order, customer: { ...order.customer, phone } }} canManageIntake />);
    const button = screen.getByRole("button", { name: intakeLabel }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const explanation = document.getElementById(button.getAttribute("aria-describedby")!.split(" ").at(-1)!)!;
    expect(explanation.textContent).toMatch(/telefono principal valido/i);
  });

  it("does not substitute an alternate phone for the primary number used by the server", () => {
    render(<RepairDocumentShareActions order={{ ...order, customer: { ...order.customer, phone: "", alternatePhone: "03571-573744" } }} canManageIntake />);
    expect((screen.getByRole("button", { name: intakeLabel }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Sin telefono principal/)).toBeTruthy();
  });

  it("shows the recipient name and stored primary number next to the send controls", () => {
    render(<RepairDocumentShareActions order={order} canManageIntake />);
    const recipient = screen.getByText(/Destinatario:/);
    expect(recipient.textContent).toContain(order.customer.fullName);
    expect(recipient.textContent).toContain(order.customer.phone);
    expect(recipient.closest("details")).toBeNull();
    expect(recipient.closest("section")).toBe(screen.getByRole("button", { name: intakeLabel }).closest("section"));
  });

  it("discloses the sender session, manual confirmation, expiry and one-document forwarded access", () => {
    render(<RepairDocumentShareActions order={order} canManageIntake />);
    const instruction = screen.getByText("Usa la sesi\u00f3n de WhatsApp Web del local. Revis\u00e1 el destinatario y confirm\u00e1 Enviar.");
    expect(instruction.closest("details")).toBeNull();
    const details = screen.getByText("Enlaces compartidos").closest("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByText(/365 d/).closest("details")).toBe(details);
    expect(screen.getByText(/reenvi/).textContent).toMatch(/solo ese comprobante, no la orden/);
    expect(screen.getByText(/La app no puede detectar/).closest("details")).toBe(details);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not revoke without explicit confirmation", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairDocumentShareActions order={order} canManageIntake />);
    openSharedLinks();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar enlaces de ingreso" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("ingreso"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["intake", "delivery"] as const)("revokes only the confirmed %s type with JSON and reports the count", async (kind) => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revoked: 2 }) });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RepairDocumentShareActions order={{ ...order, pickedUpAt: "2026-10-21" }} canManageIntake />);
    openSharedLinks();
    fireEvent.click(screen.getByRole("button", { name: kind === "intake" ? "Cancelar enlaces de ingreso" : "Cancelar enlaces de pago y garant\u00eda" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("2"));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/repair-access/document-shares", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, kind, intent: "revoke" })
    });
  });

  it("blocks duplicate revocations and sends while cancellation is pending", async () => {
    let resolve!: (response: unknown) => void;
    const fetch = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RepairDocumentShareActions order={order} canManageIntake />);
    openSharedLinks();
    const cancel = screen.getByRole("button", { name: "Cancelar enlaces de ingreso" }) as HTMLButtonElement;
    fireEvent.click(cancel);
    expect(cancel.disabled).toBe(true);
    expect((screen.getByRole("button", { name: intakeLabel }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cancel);
    expect(fetch).toHaveBeenCalledOnce();
    resolve({ ok: true, json: async () => ({ revoked: 0 }) });
    await waitFor(() => expect(cancel.disabled).toBe(false));
    expect(screen.getByRole("status").textContent).toMatch(/No habia enlaces activos/);
  });

  it.each(["http", "network", "invalid"])("shows a safe retryable error after a %s revocation failure", async (failure) => {
    const fetch = vi.fn();
    if (failure === "network") fetch.mockRejectedValue(new Error("INTERNAL SECRET"));
    else fetch.mockResolvedValue({ ok: failure !== "http", json: async () => ({ revoked: failure === "invalid" ? -1 : 2, error: "INTERNAL SECRET" }) });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RepairDocumentShareActions order={order} canManageIntake />);
    openSharedLinks();
    const cancel = screen.getByRole("button", { name: "Cancelar enlaces de ingreso" }) as HTMLButtonElement;
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/No se pudieron cancelar/));
    expect(screen.getByRole("alert").textContent).not.toContain("INTERNAL SECRET");
    expect(cancel.disabled).toBe(false);
  });
});
