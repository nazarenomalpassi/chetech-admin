// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../actions", () => ({ updateInstallmentAction: vi.fn(), cancelInstallmentAction: vi.fn(), cancelInstallmentSaleAction: vi.fn(), markInstallmentPaidAction: vi.fn(), saveInstallmentSaleAction: vi.fn() }));
import { InstallmentsView } from "./installments-view";

describe("installment edit concurrency tag", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("sends the displayed financial version with edits and cancellations without changing the payment contract", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const data = {
      migrationReady: true, today: "2026-10-05", summary: { activeSales: 1, pendingInstallments: 1, overdueInstallments: 0, paidInstallments: 0 },
      sales: [{ id: "sale", productName: "TV", customerName: "Cliente", totalAmount: 100, installmentsCount: 1, notes: "", status: "activa", displayStatus: "activa", createdAt: "2026-10-05", updatedAt: "2026-10-05", paidAmount: 0, pendingAmount: 100, paidCount: 0,
        installments: [{ id, financialVersion: 7, saleId: "sale", installmentNumber: 1, dueDate: "2026-11-05", amount: 100, paymentMethod: "nx", status: "pendiente", displayStatus: "pendiente", paidAt: null, notes: "" }] }]
    };
    const { container, rerender } = render(<InstallmentsView canCancelSales={false} filters={{}} message={null} data={data} />);
    const taggedForms = Array.from(container.querySelectorAll("form")).filter((form) => new FormData(form).get("expectedVersion"));
    expect(taggedForms).toHaveLength(2);
    for (const form of taggedForms) expect(new FormData(form).get("expectedVersion")).toBe("7");
    const payment = Array.from(container.querySelectorAll("form")).find((form) => new FormData(form).get("paidDate"));
    expect(new FormData(payment!).get("expectedVersion")).toBeNull();
    const amountInput = container.querySelector<HTMLInputElement>('input[name="amount"]')!;
    const editDisclosure = amountInput.closest("details")!;
    expect(editDisclosure).not.toBeNull();
    expect(editDisclosure.open).toBe(false);
    fireEvent.click(editDisclosure.querySelector("summary")!);
    expect(editDisclosure.open).toBe(true);
    fireEvent.change(amountInput, { target: { value: "115" } });
    fireEvent.click(editDisclosure.querySelector("summary")!);
    fireEvent.click(editDisclosure.querySelector("summary")!);
    expect(amountInput.value).toBe("115");
    expect(new FormData(amountInput.closest("form")!).get("expectedVersion")).toBe("7");
    const updated = { ...data, sales: [{ ...data.sales[0], installments: [{ ...data.sales[0].installments[0], amount: 120, financialVersion: 8 }] }] };
    rerender(<InstallmentsView canCancelSales={false} filters={{}} message={null} data={updated} />);
    expect(container.querySelector<HTMLInputElement>('input[name="amount"]')!.value).toBe("120");
    expect(Array.from(container.querySelectorAll<HTMLInputElement>('input[name="expectedVersion"]')).map((input) => input.value)).toEqual(["8", "8"]);
  });
  it("preserves a new sale draft and generated installments when the creation form is folded", () => {
    const data = { migrationReady: true, today: "2026-10-05", summary: { activeSales: 0, pendingInstallments: 0, overdueInstallments: 0, paidInstallments: 0 }, sales: [] };
    const { getByLabelText } = render(<InstallmentsView canCancelSales={false} filters={{}} message={null} data={data} />);
    const product = getByLabelText("Producto vendido en cuotas") as HTMLInputElement;
    const disclosure = product.closest("details")!;
    expect(disclosure).not.toBeNull();
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    fireEvent.change(product, { target: { value: "TV Samsung" } });
    fireEvent.change(getByLabelText("Cliente de la venta en cuotas"), { target: { value: "Cliente" } });
    fireEvent.change(getByLabelText("Monto total"), { target: { value: "100" } });
    fireEvent.change(getByLabelText("Cantidad de cuotas"), { target: { value: "2" } });
    const form = product.closest("form")!;
    const before = new FormData(form);
    expect(JSON.parse(String(before.get("installmentsJson")))).toHaveLength(2);
    fireEvent.click(disclosure.querySelector("summary")!);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(product.value).toBe("TV Samsung");
    expect(new FormData(form).get("installmentsJson")).toBe(before.get("installmentsJson"));
    expect(new FormData(form).get("requestId")).toBe(before.get("requestId"));
  });
  it("accepts comma decimals without losing the draft and submits the numeric amount", () => {
    const data = { migrationReady: true, today: "2026-10-05", summary: { activeSales: 0, pendingInstallments: 0, overdueInstallments: 0, paidInstallments: 0 }, sales: [] };
    const { getByLabelText } = render(<InstallmentsView canCancelSales={false} filters={{}} message={null} data={data} />);
    const amount = getByLabelText("Monto total") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "10," } });
    expect(amount.value).toBe("10,");
    fireEvent.change(amount, { target: { value: "10,25" } });
    expect(amount.value).toBe("10,25");
    const payload = new FormData(amount.closest("form")!);
    expect(payload.get("totalAmount")).toBe("10.25");
    expect(JSON.parse(String(payload.get("installmentsJson")))[0].amount).toBe(10.25);
  });
});
