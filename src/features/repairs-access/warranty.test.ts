import { describe, expect, it } from "vitest";

import {
  calculateWarrantyDates,
  getWarrantyState,
  toWarrantyPickupTimestamp
} from "@/features/repairs-access/warranty";

describe("repair warranty", () => {
  it("starts on the effective pickup date and adds the configured days", () => {
    expect(calculateWarrantyDates("2026-01-10", 90)).toEqual({
      startsOn: "2026-01-10",
      expiresOn: "2026-04-10"
    });
  });

  it("persists the pickup date at Buenos Aires midnight without shifting a day", () => {
    expect(toWarrantyPickupTimestamp("2026-07-25")).toBe("2026-07-25T00:00:00-03:00");
  });

  it("does not start while the equipment is waiting for pickup", () => {
    expect(
      getWarrantyState({
        hasWarranty: true,
        warrantyDays: 60,
        pickedUpAt: null,
        repairStatus: "listo_para_retirar",
        today: "2026-07-25"
      }).code
    ).toBe("pending_delivery");
  });

  it("marks a picked-up order without pickup date for review", () => {
    expect(
      getWarrantyState({
        hasWarranty: true,
        warrantyDays: 60,
        pickedUpAt: null,
        repairStatus: "retirado",
        today: "2026-07-25"
      }).code
    ).toBe("needs_review");
  });

  it("calculates active, expires today and expired states from today", () => {
    const base = {
      hasWarranty: true,
      warrantyDays: 90,
      pickedUpAt: "2026-01-10",
      repairStatus: "retirado"
    };

    expect(getWarrantyState({ ...base, today: "2026-04-09" })).toMatchObject({
      code: "active",
      expiresOn: "2026-04-10",
      daysRemaining: 1
    });
    expect(getWarrantyState({ ...base, today: "2026-04-10" })).toMatchObject({
      code: "expires_today",
      daysRemaining: 0
    });
    expect(getWarrantyState({ ...base, today: "2026-04-15" })).toMatchObject({
      code: "expired",
      daysElapsed: 5
    });
  });

  it("does not depend on a stored active boolean", () => {
    expect(
      getWarrantyState({
        hasWarranty: true,
        warrantyDays: 60,
        pickedUpAt: "2025-01-01T15:00:00.000Z",
        repairStatus: "retirado",
        today: "2026-07-25"
      }).code
    ).toBe("expired");
  });

  it("returns no warranty when it is not assigned", () => {
    expect(
      getWarrantyState({
        hasWarranty: false,
        warrantyDays: 0,
        pickedUpAt: "2026-01-10",
        repairStatus: "retirado",
        today: "2026-01-10"
      }).code
    ).toBe("none");
  });
});
