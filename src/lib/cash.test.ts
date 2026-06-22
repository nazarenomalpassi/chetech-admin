import { describe, expect, it } from "vitest";

import { formatCashMethod, getCashMethodOptions, normalizeCashMethodValue } from "./cash";

describe("normalizeCashMethodValue", () => {
  it("normaliza variantes historicas de nx local", () => {
    expect(normalizeCashMethodValue("NX Local")).toBe("mp");
    expect(normalizeCashMethodValue("NX LOCAL")).toBe("mp");
    expect(normalizeCashMethodValue("mp")).toBe("mp");
    expect(normalizeCashMethodValue("MP")).toBe("mp");
  });

  it("mantiene nx y efectivo", () => {
    expect(normalizeCashMethodValue("NX")).toBe("nx");
    expect(normalizeCashMethodValue("Efectivo")).toBe("efectivo");
  });
});

describe("formatCashMethod", () => {
  it("muestra nombres unificados en el contexto general", () => {
    expect(formatCashMethod("efectivo")).toBe("EFECTIVO");
    expect(formatCashMethod("nx")).toBe("NX SANTI");
    expect(formatCashMethod("NX")).toBe("NX SANTI");
    expect(formatCashMethod("NX Local")).toBe("NX LOCAL");
  });

  it("mapea MP historico de sueldos a NX LOCAL", () => {
    expect(formatCashMethod("mp", { context: "salary" })).toBe("NX LOCAL");
    expect(formatCashMethod("MP", { context: "salary" })).toBe("NX LOCAL");
  });
});

describe("getCashMethodOptions", () => {
  it("expone las opciones correctas para sueldos", () => {
    expect(getCashMethodOptions("salary")).toEqual([
      { value: "efectivo", label: "EFECTIVO" },
      { value: "nx", label: "NX SANTI" },
      { value: "mp", label: "NX LOCAL" }
    ]);
  });

  it("expone las mismas tres cuentas operativas para formularios de dinero", () => {
    expect(getCashMethodOptions().map((option) => option.label)).toEqual(["EFECTIVO", "NX SANTI", "NX LOCAL"]);
  });
});
