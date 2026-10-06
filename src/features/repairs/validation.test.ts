import { describe, expect, it } from "vitest";

import { getRepairValidationError } from "@/features/repairs/validation";

describe("getRepairValidationError", () => {
  it("permite una reparacion valida", () => {
    const error = getRepairValidationError({
      amount: 90000,
      payments: [{ method: "mp", amount: 90000 }]
    });

    expect(error).toBeNull();
  });

  it("permite una sena parcial sin inventar el saldo cobrado", () => {
    const error = getRepairValidationError({
      amount: 90000,
      payments: [{ method: "mp", amount: 80000 }]
    });

    expect(error).toBeNull();
  });

  it("permite una orden sin cobros", () => {
    expect(getRepairValidationError({ amount: 90000, payments: [] })).toBeNull();
  });

  it("rechaza cobros superiores al precio", () => {
    expect(getRepairValidationError({ amount: 90000, payments: [{ method: "mp", amount: 90000.01 }] })).not.toBeNull();
  });

  it("rechaza medios desconocidos o importes no finitos", () => {
    expect(getRepairValidationError({ amount: 90000, payments: [{ method: "desconocido", amount: 1 }] })).not.toBeNull();
    expect(getRepairValidationError({ amount: NaN, payments: [] })).not.toBeNull();
  });
});
