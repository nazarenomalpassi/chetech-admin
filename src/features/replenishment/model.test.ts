import { describe, expect, it } from "vitest";

import { aggregateSoldItems, calculateOrderTotal } from "@/features/replenishment/model";

describe("aggregateSoldItems", () => {
  it("excluye ventas anuladas o canceladas", () => {
    const rows = aggregateSoldItems([
      {
        productId: "cable",
        productName: "Cable USB-C",
        sku: "CAB-001",
        quantity: 2,
        unitPrice: 10_000,
        historicalUnitCost: 4_000,
        currentUnitCost: 5_000,
        saleStatus: "valid"
      },
      {
        productId: "cable",
        productName: "Cable USB-C",
        sku: "CAB-001",
        quantity: 9,
        unitPrice: 10_000,
        historicalUnitCost: 4_000,
        currentUnitCost: 5_000,
        saleStatus: "anulada"
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].quantitySold).toBe(2);
  });

  it("multiplica cantidad por costo historico y costo actual", () => {
    const [row] = aggregateSoldItems([
      {
        productId: "charger",
        productName: "Cargador",
        sku: "CAR-001",
        quantity: 3,
        unitPrice: 20_000,
        historicalUnitCost: 11_000,
        currentUnitCost: 12_500,
        saleStatus: "valid"
      }
    ]);

    expect(row.revenue).toBe(60_000);
    expect(row.historicalCost).toBe(33_000);
    expect(row.currentReplacementCost).toBe(37_500);
    expect(row.grossMargin).toBe(27_000);
    expect(calculateOrderTotal([{ quantityToOrder: 5, currentUnitCost: 12_500 }])).toBe(62_500);
  });
});
