// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaginationMeta } from "@/lib/pagination";
import { formatCurrency } from "@/lib/utils";
vi.mock("../actions", () => ({ saveInvoiceAction: vi.fn(), voidInvoiceAction: vi.fn() }));
import { InvoicesView } from "./invoices-view";

describe("primary REP billing form", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
