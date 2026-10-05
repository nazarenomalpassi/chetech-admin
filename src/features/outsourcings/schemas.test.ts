import { describe, expect, it } from "vitest";

import {
  repairOutsourcingCancelSchema,
  repairOutsourcingRetrievedSchema,
  repairOutsourcingSchema,
  repairOutsourcingStatusValues
} from "@/features/outsourcings/schemas";

describe("repairOutsourcingSchema", () => {
  const base = { repairAccessOrderId: "11111111-1111-4111-8111-111111111111", workshopName: "Taller", sentAt: "2026-10-05" };
  it("rejects promised dates before dispatch and negative costs", () => {
    expect(repairOutsourcingSchema.safeParse({ ...base, promisedAt: "2026-10-04" }).success).toBe(false);
    expect(repairOutsourcingSchema.safeParse({ ...base, expectedCost: -1 }).success).toBe(false);
    expect(repairOutsourcingSchema.safeParse({ ...base, sentAt: "2026-02-30" }).success).toBe(false);
  });
  it("retains unknown cost separately from zero", () => {
    expect(repairOutsourcingSchema.parse({ ...base, expectedCost: "" })).toHaveProperty("expectedCost", null);
    expect(repairOutsourcingSchema.parse({ ...base, expectedCost: "0" })).toHaveProperty("expectedCost", 0);
  });
  it("accepts a valid outsourcing registration", () => {
    const result = repairOutsourcingSchema.safeParse({
      repairAccessOrderId: "11111111-1111-4111-8111-111111111111",
      workshopName: "Taller amigo",
      sentAt: "2026-06-05",
      notes: "Fuente y backlight"
    });

    expect(result.success).toBe(true);
  });

  it("rejects registrations without an order or workshop", () => {
    const result = repairOutsourcingSchema.safeParse({
      repairAccessOrderId: "",
      workshopName: "",
      sentAt: "",
      notes: ""
    });

    expect(result.success).toBe(false);
  });

  it("accepts action forms that do not send optional notes", () => {
    const id = "11111111-1111-4111-8111-111111111111";

    expect(
      repairOutsourcingCancelSchema.safeParse({
        id,
        notes: null
      }).success
    ).toBe(true);

    expect(
      repairOutsourcingRetrievedSchema.safeParse({
        id,
        retrievedAt: "2026-06-22",
        notes: null
      }).success
    ).toBe(true);
  });

  it("keeps cancelled as a valid internal status for audit history", () => {
    expect(repairOutsourcingStatusValues).toContain("cancelado");
  });
});
