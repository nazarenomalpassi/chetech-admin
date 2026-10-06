import { describe, expect, it } from "vitest";

import { addDaysToDate, buildAccessPaidPayload, buildAccessUnpaidPayload } from "@/features/repairs/repair-access-sync";

describe("repair access sync helpers", () => {
  it("builds paid and unpaid access payloads", () => {
    expect(addDaysToDate("2026-06-03", 30)).toBe("2026-07-03");
    expect(addDaysToDate("2026-06-03", 0)).toBeNull();

    const paidPayload = buildAccessPaidPayload({
      amount: 120000,
      paymentMethod: "mp",
      paymentNotes: "Facturado desde reparaciones",
      userId: "user-1",
      warrantyDays: 30,
      nowIso: "2026-06-03T12:00:00.000Z"
    });

    expect(paidPayload).not.toHaveProperty("status");
    expect(paidPayload).not.toHaveProperty("final_amount");
    expect(paidPayload.payment_method).toBe("mp");
    expect(paidPayload.is_paid).toBe(true);
    for (const field of ["picked_up_at", "delivered_at", "warranty_start", "warranty_until", "warranty_active"]) {
      expect(paidPayload).not.toHaveProperty(field);
    }

    const unpaidPayload = buildAccessUnpaidPayload({
      userId: "user-1",
      nowIso: "2026-06-03T12:00:00.000Z"
    });

    expect(unpaidPayload).not.toHaveProperty("status");
    expect(unpaidPayload).not.toHaveProperty("final_amount");
    expect(unpaidPayload.payment_method).toBeNull();
    expect(unpaidPayload.is_paid).toBe(false);
    expect(unpaidPayload.paid_at).toBeNull();
    for (const field of ["picked_up_at", "delivered_at", "warranty_start", "warranty_until", "warranty_active"]) {
      expect(unpaidPayload).not.toHaveProperty(field);
    }
    const original = { status: "retirado", delivered_at: "2026-09-01", picked_up_at: "2026-09-01", warranty_start: "2026-09-01", warranty_until: "2026-10-01", warranty_active: true, final_amount: 120000 };
    expect({ ...original, ...unpaidPayload }).toMatchObject(original);
  });
});
