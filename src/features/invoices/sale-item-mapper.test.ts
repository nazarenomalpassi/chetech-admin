import { describe, expect, it } from "vitest";

import { mapInvoiceSaleItems } from "@/features/invoices/sale-item-mapper";

describe("mapInvoiceSaleItems", () => {
  it("convierte items relacionados en descripciones aptas para facturar", () => {
    expect(
      mapInvoiceSaleItems([
        {
          id: "item-1",
          product_id: "product-1",
          quantity: "2",
          unit_price: "5000",
          total: "10000",
          products: [{ name: "Cable USB", sku: "CAB-010" }]
        }
      ])
    ).toEqual([
      {
        id: "item-1",
        description: "Cable USB (CAB-010)",
        quantity: 2,
        unitPrice: 5000,
        total: 10000,
        productId: "product-1"
      }
    ]);
  });
});
