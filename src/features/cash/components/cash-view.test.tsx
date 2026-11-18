import { describe, expect, it } from "vitest";

import { describeMovement } from "./cash-view";

describe("describeMovement", () => {
  it("hides internal identifiers and redundant labels", () => {
    expect(describeMovement("Venta 3f2a1b4c-1d2e-4f5a-8b9c-0d1e2f3a4b5c", "venta")).toBe("");
    expect(
      describeMovement("Cobro reparacion 3f2a1b4c-1d2e-4f5a-8b9c-0d1e2f3a4b5c", "reparacion")
    ).toBe("");
    expect(describeMovement("", "gasto")).toBe("");
  });

  it("keeps a meaningful description", () => {
    expect(describeMovement("Alquiler de noviembre", "gasto")).toBe("Alquiler de noviembre");
    expect(describeMovement("REP-000123 cobro parcial", "reparacion")).toBe(
      "REP-000123 cobro parcial"
    );
  });
});
