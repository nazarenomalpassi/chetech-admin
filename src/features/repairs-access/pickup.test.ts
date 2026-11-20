import { describe, expect, it } from "vitest";
import {
  canRegisterPickup,
  getPaymentStatusCode,
  readPickupAnswer,
  shouldAskPickup
} from "./pickup";

describe("pickup question", () => {
  const ready = { status: "listo_para_retirar", deliveredAt: null };

  it("asks only when the payment settles a ready, undelivered order", () => {
    expect(shouldAskPickup(ready, 10000, 10000)).toBe(true);
    expect(shouldAskPickup(ready, 10000, 9999)).toBe(false);
    expect(shouldAskPickup(ready, 0, 0)).toBe(false);
    expect(shouldAskPickup({ ...ready, deliveredAt: "2026-11-20T10:00:00Z" }, 100, 100)).toBe(
      false
    );
    expect(shouldAskPickup({ status: "en_reparacion" }, 100, 100)).toBe(false);
    expect(shouldAskPickup(null, 100, 100)).toBe(false);
    expect(shouldAskPickup(ready, Number.NaN, 100)).toBe(false);
  });

  it("accepts the same statuses as the workshop delivery", () => {
    for (const status of [
      "listo_para_retirar",
      "no_presenta_fallas",
      "sin_solucion",
      "presupuestado_rechazado"
    ])
      expect(canRegisterPickup({ status })).toBe(true);
    expect(canRegisterPickup({ status: "retirado" })).toBe(false);
  });

  it("reads only explicit answers and maps the result to a status message", () => {
    expect(readPickupAnswer("si")).toBe("si");
    expect(readPickupAnswer("no")).toBe("no");
    expect(readPickupAnswer("on")).toBeNull();
    expect(readPickupAnswer(null)).toBeNull();
    expect(getPaymentStatusCode("repair_created", "done")).toBe("repair_created_picked_up");
    expect(getPaymentStatusCode("repair_payment_added", "failed")).toBe(
      "repair_payment_pickup_pending"
    );
    expect(getPaymentStatusCode("repair_payment_added", undefined)).toBe("repair_payment_added");
  });
});
