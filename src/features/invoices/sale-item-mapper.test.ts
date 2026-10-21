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

  it("uses a board sale snapshot without requiring a catalog product", () => {
    expect(mapInvoiceSaleItems([{
      id: "board-item", product_id: null, products: null, description: "Placa Fuente Samsung UN40",
      quantity: 1, unit_price: "104000.25", total: "104000.25"
    }])).toEqual([{
      id: "board-item", productId: null, description: "Placa Fuente Samsung UN40",
      quantity: 1, unitPrice: 104000.25, total: 104000.25
    }]);
  });

  it("prefers the snapshot but falls back to catalog name and SKU for empty snapshots", () => {
    const product = { name: "Cable USB", sku: "CAB-010" };
    expect(mapInvoiceSaleItems([
      { description: "  Original board description  ", products: product },
      { description: "  ", products: product }
    ]).map(item => item.description)).toEqual(["Original board description", "Cable USB (CAB-010)"]);
  });
});
