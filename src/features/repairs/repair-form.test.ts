import { describe, expect, it } from "vitest";

import { buildRepairFormFromRepair } from "@/features/repairs/repair-form";

const baseRepair = {
  id: "repair-1",
  repairAccessOrderId: "order-1",
  repairAccessOrderNumber: "REP-000001",
  customerName: "Cliente Prueba",
  customerPhone: "3571573744",
  device: "TV Samsung",
  issueDescription: "No enciende",
  finalPrice: 120000,
  estimatedPrice: 0,
  status: "entregado",
  observations: "Pago confirmado",
  createdAt: "2026-06-03T10:00:00.000Z"
};

describe("repair form helpers", () => {
  it("preserves valid payment methods and falls back safely", () => {
    expect(buildRepairFormFromRepair({ ...baseRepair, paymentMethod: "nx" }).paymentMethod).toBe("nx");
    expect(buildRepairFormFromRepair({ ...baseRepair, paymentMethod: "mp" }).paymentMethod).toBe("mp");
    expect(buildRepairFormFromRepair({ ...baseRepair, paymentMethod: "" }).paymentMethod).toBe("efectivo");
  });
});
