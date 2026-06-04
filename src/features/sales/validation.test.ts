import { describe, expect, it } from "vitest";

import { getSaleValidationError } from "@/features/sales/validation";

describe("getSaleValidationError", () => {
  it("permite una venta valida con un solo medio de pago", () => {
    const error = getSaleValidationError({
      itemCount: 1,
      totalAmount: 25000,
      payments: [{ method: "efectivo", amount: 25000 }]
    });

    expect(error).toBeNull();
  });

  it("permite una venta con dos medios de pago", () => {
    const error = getSaleValidationError({
      itemCount: 1,
      totalAmount: 25000,
      payments: [
        { method: "efectivo", amount: 15000 },
        { method: "nx", amount: 10000 }
      ]
    });

    expect(error).toBeNull();
  });
});
