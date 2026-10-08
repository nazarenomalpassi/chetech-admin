// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaginationMeta } from "@/lib/pagination";
import { formatCurrency } from "@/lib/utils";
const actions = vi.hoisted(() => ({ saveInvoiceAction: vi.fn(), voidInvoiceAction: vi.fn() }));
vi.mock("../actions", () => actions);
import { InvoicesView } from "./invoices-view";

describe("primary REP billing form", () => {
  beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const orderId = "00000000-0000-4000-8000-000000000001";
  const props = { requestId: "00000000-0000-4000-8000-000000000002", canVoid: true, invoices: [], editingInvoice: null, message: null, pagination: createPaginationMeta(0, 1, 50), options: { repairs: [], sales: [], products: [], primaryOrders: [{ id: orderId, repairNumber: "REP-000001", label: "REP-000001 - Cliente", customerName: "Cliente", customerPhone: "123", amount: 100, description: "Servicio REP-000001", notes: "Entrega pendiente" }] } };

  it("prefills the native REP and submits its identity without a legacy repair/payment", () => {
    const { container } = render(<InvoicesView {...props} initialPrimaryOrderId={orderId} />);
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("sourceType")).toBe("repair_access");
    expect(data.get("repairAccessOrderId")).toBe(orderId);
    expect(data.get("repairId")).toBeNull();
    expect(data.get("customerName")).toBe("Cliente");
    expect(JSON.parse(String(data.get("itemsJson")))[0]).toMatchObject({ description: "Servicio REP-000001", unitPrice: 100 });
    expect((screen.getByRole("button", { name: "Crear comprobante" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears the primary reference when changing origin", () => {
    const { container } = render(<InvoicesView {...props} initialPrimaryOrderId={orderId} />);
    fireEvent.change(screen.getByLabelText("Origen"), { target: { value: "manual" } });
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("sourceType")).toBe("manual");
    expect(data.get("repairAccessOrderId")).toBeNull();
  });
  it("keeps comma-decimal money drafts while submitting canonical numeric amounts", () => {
    const { container } = render(<InvoicesView {...props} initialPrimaryOrderId={orderId} />);
    const price = screen.getByLabelText("Precio unitario del ítem 1") as HTMLInputElement;
    fireEvent.change(price, { target: { value: "20," } });
    expect(price.value).toBe("20,");
    fireEvent.change(price, { target: { value: "20,15" } });
    const discount = screen.getByLabelText("Descuento") as HTMLInputElement;
    fireEvent.change(discount, { target: { value: "2," } });
    expect(discount.value).toBe("2,");
    fireEvent.change(discount, { target: { value: "2,10" } });
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("discount")).toBe("2.1");
    expect(JSON.parse(String(data.get("itemsJson")))[0].unitPrice).toBe(20.15);
    expect((screen.getByRole("button", { name: "Crear comprobante" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("filters a long REP selector by client without losing the selected order", () => {
    const { container } = render(<InvoicesView {...props} initialPrimaryOrderId={orderId} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar REP o cliente" }), { target: { value: "cliente" } });
    expect((screen.getByLabelText("REP principal") as HTMLSelectElement).value).toBe(orderId);
    expect(new FormData(container.querySelector("form")!).get("repairAccessOrderId")).toBe(orderId);
  });
  it("keeps an invoice void action behind confirmation and submits the selected version from the menu", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const invoice = { id: "invoice-1", invoiceNumber: "FAC-000001", customerName: "Cliente", customerPhone: "123", sourceType: "repair_access", total: 100, paidTotal: 0, balance: 100, documentVersion: 4, fiscalReference: null, fiscalLockedAt: null, status: "pendiente", createdAt: "2026-10-05" };
    render(<InvoicesView {...props} invoices={[invoice]} />);
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Más acciones" })[0]);
    const button = screen.getByRole("button", { name: "Anular" });
    await act(async () => { fireEvent.click(button); });
    expect(actions.voidInvoiceAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => { fireEvent.click(button); });
    expect(actions.voidInvoiceAction).toHaveBeenCalledTimes(1);
    const data = actions.voidInvoiceAction.mock.calls[0][0] as FormData;
    expect(data.get("id")).toBe(invoice.id);
    expect(data.get("expectedVersion")).toBe("4");
  });
  it("previews fractional totals and discount limits using exact per-line rounding", () => {
    render(<InvoicesView {...props} initialPrimaryOrderId={orderId} />);
    fireEvent.change(screen.getByLabelText("Cantidad del ítem 1"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("Precio unitario del ítem 1"), { target: { value: "20.15" } });
    expect(screen.getAllByText(formatCurrency(10.08).replace(/\s/g, " ")).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(formatCurrency(10.07).replace(/\s/g, " "))).toBeNull();
    fireEvent.change(screen.getByLabelText("Descuento"), { target: { value: "10.08" } });
    expect((screen.getByRole("button", { name: "Crear comprobante" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Descuento"), { target: { value: "10.09" } });
    expect(screen.getAllByText(formatCurrency(10.08).replace(/\s/g, " ")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("alert").textContent).toContain("descuento");
    expect((screen.getByRole("button", { name: "Crear comprobante" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
