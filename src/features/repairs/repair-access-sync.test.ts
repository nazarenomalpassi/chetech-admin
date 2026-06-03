import assert from "node:assert/strict";

import { addDaysToDate, buildAccessPaidPayload, buildAccessUnpaidPayload } from "@/features/repairs/repair-access-sync";

assert.equal(addDaysToDate("2026-06-03", 30), "2026-07-03");
assert.equal(addDaysToDate("2026-06-03", 0), null);

const paidPayload = buildAccessPaidPayload({
  amount: 120000,
  paymentMethod: "mp",
  paymentNotes: "Facturado desde reparaciones",
  userId: "user-1",
  warrantyDays: 30,
  nowIso: "2026-06-03T12:00:00.000Z"
});

assert.equal(paidPayload.status, "retirado");
assert.equal(paidPayload.final_amount, 120000);
assert.equal(paidPayload.payment_method, "mp");
assert.equal(paidPayload.is_paid, true);
assert.equal(paidPayload.warranty_start, "2026-06-03");
assert.equal(paidPayload.warranty_until, "2026-07-03");

const unpaidPayload = buildAccessUnpaidPayload({
  userId: "user-1",
  nowIso: "2026-06-03T12:00:00.000Z"
});

assert.equal(unpaidPayload.status, "listo_para_retirar");
assert.equal(unpaidPayload.final_amount, null);
assert.equal(unpaidPayload.payment_method, null);
assert.equal(unpaidPayload.is_paid, false);
assert.equal(unpaidPayload.paid_at, null);
assert.equal(unpaidPayload.warranty_active, false);

console.log("repair access sync helpers ok");
