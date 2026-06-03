import assert from "node:assert/strict";

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

assert.equal(normalizeWhatsAppPhone("3571 573744"), "5493571573744");
assert.equal(normalizeWhatsAppPhone("+54 9 3571 573744"), "5493571573744");
assert.equal(normalizeWhatsAppPhone("03571-573744"), "5493571573744");
assert.equal(normalizeWhatsAppPhone("123"), "");

const readyTemplate = getRepairAccessWhatsAppTemplate({ ...baseOrder, status: "listo_para_retirar" });
assert.equal(readyTemplate.kind, "ready");
assert.equal(readyTemplate.label, "Avisar listo");

const href = buildRepairAccessWhatsAppHref(baseOrder, "ready");
assert.ok(href?.startsWith("https://wa.me/5493571573744?text="));
assert.ok(decodeURIComponent(href ?? "").includes("REP-000123"));
assert.ok(decodeURIComponent(href ?? "").includes("TV Samsung 43"));
assert.ok(decodeURIComponent(href ?? "").includes("listo para retirar"));

const budgetHref = buildRepairAccessWhatsAppHref({ ...baseOrder, status: "presupuestado" }, "budget");
assert.ok(decodeURIComponent(budgetHref ?? "").includes("presupuesto"));
assert.ok(decodeURIComponent(budgetHref ?? "").includes("Cambio de leds"));
assert.ok(decodeURIComponent(budgetHref ?? "").includes("le saldria $"));
assert.ok(decodeURIComponent(budgetHref ?? "").includes("90.000,00"));
assert.ok(decodeURIComponent(budgetHref ?? "").includes("tiene de garantia 30 dias"));

const noSolutionHref = buildRepairAccessWhatsAppHref(
  { ...baseOrder, deviceLabel: "TV Samsung 43", status: "sin_solucion" },
  "no_solution"
);
assert.ok(decodeURIComponent(noSolutionHref ?? "").includes("lamentamos informarle"));
assert.ok(decodeURIComponent(noSolutionHref ?? "").includes("TV Samsung 43"));
assert.ok(decodeURIComponent(noSolutionHref ?? "").includes("no va a tener reparacion"));

console.log("repair access whatsapp helpers ok");
