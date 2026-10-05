import { describe, expect, it } from "vitest";

import { mapRepairsHistoryRows } from "@/features/repairs/history-mapper";

describe("mapRepairsHistoryRows", () => {
  it("usa el ultimo pago relacionado y conserva todos los medios", () => {
    const [repair] = mapRepairsHistoryRows([
      {
        id: "repair-1",
        repair_access_order_id: "access-1",
        customer_name: "Cliente",
        customer_phone: "123",
        device: "Televisor",
        order_number: 25,
        issue_description: "No enciende",
        final_price: "30000",
        estimated_price: "28000",
        status: "entregado",
        observations: null,
        entry_date: "2026-08-28",
        created_at: "2026-08-28T12:00:00.000Z",
        repair_access_orders: { repair_number: "REP-000400" },
        repair_payments: [
          { method: "efectivo", amount: "10000", created_at: "2026-08-28T13:00:00.000Z" },
          { method: "NX Local", amount: "20000", created_at: "2026-08-28T14:00:00.000Z" }
        ]
      }
    ]);

    expect(repair.paymentMethod).toBe("mp");
    expect(repair.payments).toEqual([
      { method: "efectivo", amount: 10000, created_at: "2026-08-28T13:00:00.000Z" },
      { method: "mp", amount: 20000, created_at: "2026-08-28T14:00:00.000Z" }
    ]);
    expect(repair.repairAccessOrderNumber).toBe("REP-000400");
    expect(repair.entryDate).toBe("2026-08-28");
  });

  it("mantiene compatibilidad con filas antiguas sin relaciones", () => {
    const [repair] = mapRepairsHistoryRows([
      {
        id: "repair-legacy",
        customer_name: "Historico",
        device: "Radio",
        issue_description: null,
        final_price: null,
        estimated_price: "5000",
        status: "pendiente",
        created_at: "2026-08-01T12:00:00.000Z"
      }
    ]);

    expect(repair.entryDate).toBe("2026-08-01");
    expect(repair.payments).toEqual([]);
    expect(repair.paymentMethod).toBe("");
  });
});
