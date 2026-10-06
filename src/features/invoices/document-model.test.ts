import { describe, expect, it } from "vitest";
import { calculateInvoiceAmounts, deriveDocumentSettlement } from "./document-model";
import { invoiceFormSchema } from "./schemas";

describe("document settlement", () => {
  it.each([
    [100, [], "pendiente", 0, 100],
    [100, [{ amount: 30 }], "parcial", 30, 70],
    [100, [{ amount: 30 }, { amount: 70 }], "pagado", 100, 0],
    [100, [{ amount: 120 }], "pagado", 120, 0],
    [0, [], "pagado", 0, 0]
  ])("derives real paid and balance without a synthetic payment", (total, payments, status, paidTotal, balance) => {
    expect(deriveDocumentSettlement(total, payments)).toEqual({ paidTotal, balance, status });
  });
  it("counts amounts in cents and keeps actual payments on voided documents", () => {
    expect(deriveDocumentSettlement(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toEqual({ paidTotal: 0.3, balance: 0, status: "pagado" });
    expect(deriveDocumentSettlement(100, [{ amount: 30 }], true)).toEqual({ paidTotal: 30, balance: 0, status: "anulado" });
  });
});

describe("decimal invoice amounts", () => {
  it.each([[0.5, 20.15, 10.08], [0.3, 33.35, 10.01], [0.01, 0.5, 0.01], [2.5, 0.01, 0.03]])("rounds each fractional line half-up like PostgreSQL numeric", (quantity, unitPrice, total) => {
    expect(calculateInvoiceAmounts([{ quantity, unitPrice }], 0)).toEqual({ lineTotals: [total], subtotal: total, discount: 0, total });
  });
  it("sums rounded lines before validating and subtracting the discount in cents", () => {
    expect(calculateInvoiceAmounts([{ quantity: 0.5, unitPrice: 20.15 }, { quantity: 0.5, unitPrice: 20.15 }], 0.01)).toEqual({ lineTotals: [10.08, 10.08], subtotal: 20.16, discount: 0.01, total: 20.15 });
    expect(calculateInvoiceAmounts([{ quantity: 0.5, unitPrice: 20.15 }], 10.08).total).toBe(0);
    expect(() => calculateInvoiceAmounts([{ quantity: 0.5, unitPrice: 20.15 }], 10.09)).toThrow(/descuento/i);
  });
  it("rejects unsupported precision and unsafe invoice totals instead of silently rounding invalid inputs", () => {
    expect(() => calculateInvoiceAmounts([{ quantity: 0.001, unitPrice: 20.15 }], 0)).toThrow();
    expect(() => calculateInvoiceAmounts([{ quantity: 1, unitPrice: 20.151 }], 0)).toThrow();
    expect(() => calculateInvoiceAmounts([{ quantity: 9999999999.99, unitPrice: 9999999999.99 }], 0)).toThrow();
  });
});

describe("invoice validation", () => {
  const input = { customerName: "Cliente", sourceType: "manual", items: [{ description: "Servicio", quantity: 1, unitPrice: 100 }] };
  it("requires a real linked source for sale and repair", () => {
    expect(invoiceFormSchema.safeParse({ ...input, sourceType: "repair" }).success).toBe(false);
    expect(invoiceFormSchema.safeParse({ ...input, sourceType: "sale" }).success).toBe(false);
  });
  it("allows a primary REP without a legacy financial record", () => {
    expect(invoiceFormSchema.safeParse({ ...input, sourceType: "repair_access", repairAccessOrderId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(invoiceFormSchema.safeParse({ ...input, sourceType: "repair_access" }).success).toBe(false);
  });
  it("rejects discounts above subtotal", () => {
    expect(invoiceFormSchema.safeParse({ ...input, discount: 101 }).success).toBe(false);
  });
  it("validates discount against the same half-up fractional subtotal as SQL", () => {
    const items = [{ description: "Medio servicio", quantity: 0.5, unitPrice: 20.15 }];
    expect(invoiceFormSchema.safeParse({ ...input, items, discount: 10.08 }).success).toBe(true);
    expect(invoiceFormSchema.safeParse({ ...input, items, discount: 10.09 }).success).toBe(false);
  });
  it("requires a version when editing", () => {
    expect(invoiceFormSchema.safeParse({ ...input, id: "00000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });
});
