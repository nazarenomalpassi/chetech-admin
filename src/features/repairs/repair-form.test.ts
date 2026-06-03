import assert from "node:assert/strict";

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

assert.equal(buildRepairFormFromRepair({ ...baseRepair, paymentMethod: "nx" }).paymentMethod, "nx");
assert.equal(buildRepairFormFromRepair({ ...baseRepair, paymentMethod: "mp" }).paymentMethod, "mp");
assert.equal(buildRepairFormFromRepair({ ...baseRepair, paymentMethod: "" }).paymentMethod, "efectivo");

console.log("repair form helpers ok");
