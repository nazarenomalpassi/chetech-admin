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

    expect(paidPayload.status).toBe("retirado");
    expect(paidPayload.final_amount).toBe(120000);
    expect(paidPayload.payment_method).toBe("mp");
    expect(paidPayload.is_paid).toBe(true);
    expect(paidPayload.warranty_start).toBe("2026-06-03");
    expect(paidPayload.warranty_until).toBe("2026-07-03");

    const unpaidPayload = buildAccessUnpaidPayload({
      userId: "user-1",
      nowIso: "2026-06-03T12:00:00.000Z"
    });

    expect(unpaidPayload.status).toBe("listo_para_retirar");
    expect(unpaidPayload.final_amount).toBeNull();
    expect(unpaidPayload.payment_method).toBeNull();
    expect(unpaidPayload.is_paid).toBe(false);
    expect(unpaidPayload.paid_at).toBeNull();
    expect(unpaidPayload.warranty_active).toBe(false);
  });
});
