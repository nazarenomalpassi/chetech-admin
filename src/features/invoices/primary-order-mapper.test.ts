import { describe, expect, it } from "vitest";
import { mapPrimaryOrderOption } from "./primary-order-mapper";
describe("primary REP invoice options", () => {
  it("uses agreed price and primary order identity without requiring payment", () => {
    expect(mapPrimaryOrderOption({ id: "primary", repair_number: "REP-000123", status: "presupuestado_aceptado", is_paid: false, approved_amount: 90000, budget_amount: 80000, issue_reported: "No enciende", repair_access_customers: [{ full_name: "Cliente", phone: "123" }], repair_access_devices: { device_type: "TV", brand: "Marca", model: "Modelo" } })).toMatchObject({ id: "primary", repairNumber: "REP-000123", customerName: "Cliente", customerPhone: "123", amount: 90000, description: "Servicio tecnico REP-000123 - TV Marca Modelo. No enciende" });
  });
  it.each([
    [{ final_amount: 0, approved_amount: 80000, budget_amount: 70000 }, 80000],
    [{ final_amount: 0, approved_amount: 0, budget_amount: "80000.00" }, 80000],
    [{ final_amount: 90000, approved_amount: 80000, budget_amount: 70000 }, 90000],
    [{ final_amount: 0, approved_amount: 0, budget_amount: 0 }, 0]
  ])("chooses the first positive agreed price while preserving genuinely free cohorts", (pricing, amount) => {
    expect(mapPrimaryOrderOption({ id: "primary", ...pricing }).amount).toBe(amount);
  });
});
