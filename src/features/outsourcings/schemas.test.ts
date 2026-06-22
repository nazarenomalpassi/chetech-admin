import { describe, expect, it } from "vitest";

import {
  repairOutsourcingCancelSchema,
  repairOutsourcingRetrievedSchema,
  repairOutsourcingSchema,
  repairOutsourcingStatusValues
} from "@/features/outsourcings/schemas";

describe("repairOutsourcingSchema", () => {
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
