import { describe, expect, it } from "vitest";

import {
  buildRepairAccessWhatsAppHref,
  getRepairAccessWhatsAppTemplate,
  normalizeWhatsAppPhone
} from "@/features/repairs-access/whatsapp";

const baseOrder = {
  repairNumber: "REP-000123",
  customerName: "Juan Perez",
  phone: "3571 573744",
  deviceLabel: "TV Samsung 43",
  budgetAmount: 85000,
  finalAmount: 90000,
  status: "listo_para_retirar",
  budgetDetail: "Cambio de leds",
  warrantyDays: 30
};

describe("repair access whatsapp helpers", () => {
  it("normalizes local phones", () => {
    expect(normalizeWhatsAppPhone("3571 573744")).toBe("5493571573744");
    expect(normalizeWhatsAppPhone("+54 9 3571 573744")).toBe("5493571573744");
    expect(normalizeWhatsAppPhone("03571-573744")).toBe("5493571573744");
    expect(normalizeWhatsAppPhone("123")).toBe("");
  });

  it("builds ready, budget and no solution messages", () => {
    const readyTemplate = getRepairAccessWhatsAppTemplate({ ...baseOrder, status: "listo_para_retirar" });
    expect(readyTemplate.kind).toBe("ready");
    expect(readyTemplate.label).toBe("Avisar listo");

    const href = buildRepairAccessWhatsAppHref(baseOrder, "ready");
    expect(href?.startsWith("https://wa.me/5493571573744?text=")).toBe(true);
    expect(decodeURIComponent(href ?? "")).toContain("REP-000123");
    expect(decodeURIComponent(href ?? "")).toContain("TV Samsung 43");
    expect(decodeURIComponent(href ?? "")).toContain("listo para retirar");

    const budgetHref = buildRepairAccessWhatsAppHref({ ...baseOrder, status: "presupuestado" }, "budget");
    expect(decodeURIComponent(budgetHref ?? "")).toContain("presupuesto");
    expect(decodeURIComponent(budgetHref ?? "")).toContain("Hola Juan Perez");
    expect(decodeURIComponent(budgetHref ?? "")).toContain("Cambio de leds");
    expect(decodeURIComponent(budgetHref ?? "")).toContain("El total final seria $");
    expect(decodeURIComponent(budgetHref ?? "")).toContain("90.000,00");
    expect(decodeURIComponent(budgetHref ?? "")).toContain("tiene de garantia 30 dias");

    const noSolutionHref = buildRepairAccessWhatsAppHref(
      { ...baseOrder, deviceLabel: "TV Samsung 43", status: "sin_solucion" },
      "no_solution"
    );
    expect(decodeURIComponent(noSolutionHref ?? "")).toContain("lamentamos informarle");
    expect(decodeURIComponent(noSolutionHref ?? "")).toContain("TV Samsung 43");
    expect(decodeURIComponent(noSolutionHref ?? "")).toContain("no va a tener reparacion");
  });
});
