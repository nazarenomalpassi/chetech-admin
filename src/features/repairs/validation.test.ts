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

  it("rechaza pagos que no coinciden con el total de la reparacion", () => {
    const error = getRepairValidationError({
      amount: 90000,
      payments: [{ method: "mp", amount: 80000 }]
    });

    expect(error).toContain("90000.00");
  });
});
