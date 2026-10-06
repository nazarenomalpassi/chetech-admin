import { describe, expect, it } from "vitest";

import {
  buildHistoricalPublicOrderNumberPlan,
  buildRepairHistoryImportPlan,
  classifyHistoricalCustomerMatch,
  getHistoricalRowValue,
  mapHistoricalRepairStatus,
  normalizeHistoricalRepairRow,
  normalizeHistoricalPhone,
  validateHistoricalOrderNumbers
} from "@/features/repairs-access/history-import";

describe("repair history import", () => {
  it("normalizes common Argentine mobile formats without accepting zero", () => {
    expect(normalizeHistoricalPhone("(03571) 15-638381")).toBe("3571638381");
    expect(normalizeHistoricalPhone("+54 9 3571 638381")).toBe("3571638381");
    expect(normalizeHistoricalPhone(0)).toBeNull();
    expect(normalizeHistoricalPhone("")).toBeNull();
  });

  it("resolves accented headers and both serial-number columns", () => {
    const row = {
      "Número de orden": 123,
      "Número de serie": "",
      "Número De Serie": "SN-99"
    };

    expect(getHistoricalRowValue(row, "numero de orden")).toBe(123);
    expect(getHistoricalRowValue(row, "numero de serie")).toBe("SN-99");
  });

  it("uses pickup as the strongest historical status evidence", () => {
    expect(
      mapHistoricalRepairStatus({
        pickedUp: true,
        repaired: true,
        budgeted: true,
        writtenOff: false
      })
    ).toBe("retirado");
    expect(
      mapHistoricalRepairStatus({
        pickedUp: false,
        repaired: true,
        budgeted: true,
        writtenOff: false
      })
    ).toBe("listo_para_retirar");
    expect(
      mapHistoricalRepairStatus({
        pickedUp: false,
        repaired: false,
        budgeted: false,
        writtenOff: true
      })
    ).toBe("sin_solucion");
  });

  it("links an exact phone and compatible name", () => {
    expect(
      classifyHistoricalCustomerMatch(
        {
          fullName: "Lerda Miguel",
          fullNameNormalized: "lerda miguel",
          phoneNormalized: "3571606381",
          dni: null,
          addressNormalized: null
        },
        [
          {
            id: "customer-1",
            fullNameNormalized: "lerda miguel",
            phoneNormalized: "3571606381",
            alternatePhoneNormalized: null,
            dni: null,
            addressNormalized: null
          }
        ]
      )
    ).toEqual({ kind: "existing", customerId: "customer-1", reason: "phone_and_name" });
  });

  it("does not merge different people that share a phone", () => {
    expect(
      classifyHistoricalCustomerMatch(
        {
          fullName: "Alba Erica",
          fullNameNormalized: "alba erica",
          phoneNormalized: "3571319506",
          dni: null,
          addressNormalized: null
        },
        [
          {
            id: "customer-2",
            fullNameNormalized: "guerini gustavo",
            phoneNormalized: "3571319506",
            alternatePhoneNormalized: null,
            dni: null,
            addressNormalized: null
          }
        ]
      )
    ).toEqual({
      kind: "ambiguous",
      candidateIds: ["customer-2"],
      reason: "shared_phone_incompatible_identity"
    });
  });

  it("maps a picked-up historical order without a date as requiring review", () => {
    const result = normalizeHistoricalRepairRow(
      {
        "Número de orden": 3,
        "Nombre Cliente": "Hattemer Leandro",
        "Teléfono Celular": "3571683070",
        Equipo: "Televisor LED",
        Marca: "LG",
        Modelo: "43UH6500-SB",
        Defecto: "Reparacion de led especial",
        "Fecha de ingreso": new Date("2024-11-27T03:00:48.000Z"),
        "Retiró (Sí-No)": true,
        "Fecha de retiro": null,
        "Reparación realizada": true,
        Presupuestado: true,
        "GarantíaTiempoDeFalla": 90
      },
      3
    );

    expect(result).toMatchObject({
      stableKey: "service_export:3",
      legacyOrderNumber: "3",
      rowNumber: 3,
      customer: {
        fullName: "Hattemer Leandro",
        phoneNormalized: "3571683070"
      },
      device: {
        deviceType: "Televisor LED",
        brand: "LG",
        model: "43UH6500-SB"
      },
      order: {
        status: "retirado",
        intakeDate: "2024-11-27",
        pickedUpAt: null,
        hasWarranty: true,
        warrantyDays: 90,
        warrantyRequiresReview: true
      }
    });
    expect(result.reviewReasons).toContain("retirada_sin_fecha");
  });

  it("validates and preserves a matching historical warranty expiry", () => {
    const result = normalizeHistoricalRepairRow(
      {
        "Número de orden": 1,
        "Nombre Cliente": "Buffon Miguel Angel",
        Equipo: "Televisor LED",
        Defecto: "No enciende",
        "Fecha de ingreso": new Date("2024-12-31T03:00:48.000Z"),
        "Retiró (Sí-No)": true,
        "Fecha de retiro": new Date("2025-01-03T03:00:48.000Z"),
        "GarantíaTiempoDeFalla": 90,
        "Garantía hasta": new Date("2025-04-03T03:00:48.000Z")
      },
      2
    );

    expect(result.order).toMatchObject({
      pickedUpAt: "2025-01-03",
      warrantyStart: "2025-01-03",
      warrantyUntil: "2025-04-03",
      warrantyRequiresReview: false
    });
    expect(result.reviewReasons).not.toContain("vencimiento_inconsistente");
  });

  it("plans one customer for multiple orders and becomes idempotent on a second run", () => {
    const rows = [10, 11].map((order, index) =>
      normalizeHistoricalRepairRow(
        {
          "Número de orden": order,
          "Nombre Cliente": "Cliente Repetido",
          "Teléfono Celular": "3571555555",
          Equipo: "Televisor",
          Defecto: "No enciende",
          "Fecha de ingreso": new Date(`2026-01-${String(index + 2).padStart(2, "0")}T03:00:00.000Z`)
        },
        index + 2
      )
    );

    const firstRun = buildRepairHistoryImportPlan({
      rows,
      existingCustomers: [],
      existingOrders: []
    });
    expect(firstRun.summary).toMatchObject({
      ordersNew: 2,
      ordersSkipped: 0,
      customersNew: 1
    });
    expect(new Set(firstRun.orders.map((order) => order.customerKey)).size).toBe(1);

    const secondRun = buildRepairHistoryImportPlan({
      rows,
      existingCustomers: [],
      existingOrders: rows.map((row) => ({
        id: `order-${row.legacyOrderNumber}`,
        stableKey: row.stableKey,
        legacyOrderNumber: row.legacyOrderNumber
      }))
    });
    expect(secondRun.summary).toMatchObject({
      ordersNew: 0,
      ordersSkipped: 2,
      customersNew: 0
    });
  });

  it("rejects duplicated historical public numbers before importing", () => {
    expect(() =>
      validateHistoricalOrderNumbers([
        { rowNumber: 2, legacyOrderNumber: "15" },
        { rowNumber: 3, legacyOrderNumber: "15" }
      ])
    ).toThrow("Numero historico repetido 15");
  });

  it("rejects non-positive or non-numeric historical public numbers", () => {
    expect(() =>
      validateHistoricalOrderNumbers([
        { rowNumber: 2, legacyOrderNumber: "ORDEN-SIN-NUMERO" }
      ])
    ).toThrow("Numero historico invalido");
    expect(() =>
      validateHistoricalOrderNumbers([
        { rowNumber: 2, legacyOrderNumber: "0" }
      ])
    ).toThrow("Numero historico invalido");
  });

  it("maps the verified legacy suffix into the historical public range", () => {
    const missingLegacyNumbers = new Set([2, 4, 152, 158, 199]);
    const rows = Array.from({ length: 266 }, (_, index) => index + 1)
      .filter((number) => !missingLegacyNumbers.has(number))
      .map((number, index) => ({
        rowNumber: index + 2,
        legacyOrderNumber: String(number)
      }));

    const plan = buildHistoricalPublicOrderNumberPlan(rows, {
      maximumPublicOrderNumber: 265
    });

    expect(plan.closedLegacyGaps).toEqual([199]);
    expect(plan.byLegacyOrderNumber["198"]).toBe(198);
    expect(plan.byLegacyOrderNumber["200"]).toBe(199);
    expect(plan.byLegacyOrderNumber["266"]).toBe(265);
    expect(new Set(Object.values(plan.byLegacyOrderNumber)).size).toBe(rows.length);
  });
});
