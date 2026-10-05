import { describe, expect, it } from "vitest";

import { mapSalesHistoryRows } from "@/features/sales/history-mapper";

describe("mapSalesHistoryRows", () => {
  it("arma pagos e items relacionados sin una segunda consulta", () => {
    const result = mapSalesHistoryRows([
      {
        id: "sale-1",
        sale_number: "V-0100",
        subtotal: "25000",
        cost_total: "12000",
        profit_total: "13000",
        sold_at: "2026-08-28T15:00:00.000Z",
        notes: null,
        sale_payments: [
          { method: "efectivo", amount: "15000" },
          { method: "NX Santi", amount: "10000" }
        ],
        sale_items: [
          {
            product_id: "product-1",
            quantity: 1,
            unit_price: "25000",
            total: "25000",
            products: { name: "Adaptador", sku: "CAB-001" }
          }
        ]
      }
    ]);

    expect(result).toEqual([
      {
        id: "sale-1",
        saleNumber: "V-0100",
        subtotal: 25000,
        costTotal: 12000,
        profitTotal: 13000,
        soldAt: "2026-08-28T15:00:00.000Z",
        notes: "",
        payments: [
          { method: "efectivo", amount: 15000 },
          { method: "nx", amount: 10000 }
        ],
        items: [
          {
            productId: "product-1",
            productName: "Adaptador",
            quantity: 1,
            unitPrice: 25000,
            total: 25000
          }
        ]
      }
    ]);
  });

  it("tolera relaciones vacias o devueltas como arreglo", () => {
    const [sale] = mapSalesHistoryRows([
      {
        id: "sale-2",
        sale_number: "V-0101",
        subtotal: 0,
        cost_total: 0,
        profit_total: 0,
        sold_at: "2026-08-28T15:00:00.000Z",
        notes: "",
        sale_payments: null,
        sale_items: [
          {
            product_id: "product-2",
            quantity: "2",
            unit_price: "10",
            total: "20",
            products: [{ name: "Cable", sku: "CAB-002" }]
          }
        ]
      }
    ]);

    expect(sale.payments).toEqual([]);
    expect(sale.items[0].productName).toBe("Cable");
  });
});
