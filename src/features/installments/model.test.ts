import { describe, expect, it } from "vitest";

import {
  generateInstallments,
  getInstallmentSaleStatus,
  resolveInstallmentStatus
} from "@/features/installments/model";

describe("generateInstallments", () => {
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
