import { describe, expect, it } from "vitest";

import {
  generateInstallments,
  getInstallmentSaleStatus,
  resolveInstallmentStatus
} from "@/features/installments/model";

describe("generateInstallments", () => {
  it.each([
    ["2026-01-31", ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]],
    ["2028-01-31", ["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]],
    ["2026-12-31", ["2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]],
    ["2028-02-29", ["2028-02-29", "2028-03-29", "2028-04-29", "2028-05-29"]]
  ])("clamps each target month from the original day: %s", (firstDueDate, expected) => {
    expect(generateInstallments({ totalAmount: 100, installmentsCount: 4, firstDueDate, paymentMethod: "nx" })
      .map((item) => item.dueDate)).toEqual(expected);
  });

  it("rejects impossible dates rather than silently rolling them over", () => {
    expect(() => generateInstallments({ totalAmount: 100, installmentsCount: 2, firstDueDate: "2026-02-31", paymentMethod: "mp" })).toThrow();
  });
  it("genera cuotas mensuales a partir de la primera fecha", () => {
    expect(
      generateInstallments({
        totalAmount: 300000,
        installmentsCount: 3,
        firstDueDate: "2026-06-10",
        paymentMethod: "mp"
      })
    ).toEqual([
      {
        installmentNumber: 1,
        dueDate: "2026-06-10",
        amount: 100000,
        paymentMethod: "mp",
        status: "pendiente",
        notes: ""
      },
      {
        installmentNumber: 2,
        dueDate: "2026-07-10",
        amount: 100000,
        paymentMethod: "mp",
        status: "pendiente",
        notes: ""
      },
      {
        installmentNumber: 3,
        dueDate: "2026-08-10",
        amount: 100000,
        paymentMethod: "mp",
        status: "pendiente",
        notes: ""
      }
    ]);
  });

  it("ajusta centavos en la ultima cuota para que el total cierre", () => {
    expect(
      generateInstallments({
        totalAmount: 100000,
        installmentsCount: 3,
        firstDueDate: "2026-06-10",
        paymentMethod: "efectivo"
      }).map((installment) => installment.amount)
    ).toEqual([33333.33, 33333.33, 33333.34]);
  });
});

describe("resolveInstallmentStatus", () => {
  it("muestra vencida si la cuota pendiente ya paso", () => {
    expect(resolveInstallmentStatus("pendiente", "2026-05-25", "2026-05-28")).toBe("vencida");
  });

  it("respeta pagada y cancelada", () => {
    expect(resolveInstallmentStatus("pagada", "2026-05-25", "2026-05-28")).toBe("pagada");
    expect(resolveInstallmentStatus("cancelada", "2026-05-25", "2026-05-28")).toBe("cancelada");
  });
});

describe("getInstallmentSaleStatus", () => {
  it("does not consider cancelled installments unpaid debt", () => {
    expect(getInstallmentSaleStatus("activa", [{ status: "pagada", dueDate: "2026-10-05" }, { status: "cancelada", dueDate: "2026-11-05" }])).toBe("finalizada");
  });
  it("marca la venta como finalizada si todas las cuotas estan pagadas", () => {
    expect(
      getInstallmentSaleStatus("activa", [
        { status: "pagada", dueDate: "2026-06-10" },
        { status: "pagada", dueDate: "2026-07-10" }
      ])
    ).toBe("finalizada");
  });

  it("mantiene activa si quedan cuotas pendientes o vencidas", () => {
    expect(
      getInstallmentSaleStatus("activa", [
        { status: "pagada", dueDate: "2026-06-10" },
        { status: "pendiente", dueDate: "2026-07-10" }
      ])
    ).toBe("activa");
  });
});
