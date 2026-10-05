import { describe, expect, it } from "vitest";

import {
  repairAccessTechnicalSchema,
  repairAccessWorkshopSchema,
  repairCustomerLinkSchema,
  repairCustomerPortalSchema
} from "@/features/repairs-access/schemas";

describe("repairAccessTechnicalSchema", () => {
  const basePayload = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "listo_para_retirar",
    hasWarranty: true,
    warrantyDays: "90",
    pickedUpAt: "",
    isPaid: false
  };

  it("acepta una garantia pendiente mientras el equipo no fue retirado", () => {
    expect(repairAccessTechnicalSchema.safeParse(basePayload).success).toBe(true);
  });

  it("exige una duracion positiva cuando la reparacion tiene garantia", () => {
    expect(
      repairAccessTechnicalSchema.safeParse({ ...basePayload, warrantyDays: "0" }).success
    ).toBe(false);
  });

  it("exige la fecha efectiva de retiro al marcar la orden como retirada", () => {
    expect(
      repairAccessTechnicalSchema.safeParse({ ...basePayload, status: "retirado" }).success
    ).toBe(false);
  });

  it("acepta una orden retirada con su fecha efectiva", () => {
    expect(
      repairAccessTechnicalSchema.safeParse({
        ...basePayload,
        status: "retirado",
        pickedUpAt: "2026-07-25"
      }).success
    ).toBe(true);
  });
});

describe("repairAccessWorkshopSchema", () => {
  it("acepta la actualizacion operativa que necesita un tecnico", () => {
    const result = repairAccessWorkshopSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      status: "en_revision",
      repairAmount: "125000",
      budgetDetail: "Cambio de fuente y prueba general.",
      repairProgress: "Fuente desmontada; repuesto confirmado."
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.repairAmount).toBe(125000);
  });

  it("rechaza montos negativos sin aceptar una actualizacion parcial invalida", () => {
    const result = repairAccessWorkshopSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      status: "presupuestado",
      repairAmount: "-1",
      budgetDetail: "Presupuesto informado.",
      repairProgress: ""
    });

    expect(result.success).toBe(false);
  });
});

describe("esquemas del portal de clientes", () => {
  it("acepta vincular y desvincular una cuenta con identificadores validos", () => {
    const orderId = "11111111-1111-4111-8111-111111111111";
    const customerId = "22222222-2222-4222-8222-222222222222";

    expect(
      repairCustomerLinkSchema.safeParse({ orderId, customerUserId: customerId }).success
    ).toBe(true);
    expect(repairCustomerLinkSchema.safeParse({ orderId, customerUserId: null }).success).toBe(
      true
    );
    expect(
      repairCustomerLinkSchema.safeParse({ orderId, customerUserId: "cliente-invalido" }).success
    ).toBe(false);
  });

  it("valida el contenido publico y su fecha de vigencia", () => {
    const basePayload = {
      id: "11111111-1111-4111-8111-111111111111",
      publicProgress: "Diagnostico finalizado.",
      publicNextStep: "Esperamos tu confirmacion.",
      customerActionRequired: true,
      budgetVisibleToCustomer: true,
      publicBudgetDescription: "Cambio del componente y pruebas.",
      publishUpdate: true,
      returnToOrders: false
    };

    expect(
      repairCustomerPortalSchema.safeParse({
        ...basePayload,
        budgetValidUntil: "2026-08-15"
      }).success
    ).toBe(true);
    expect(
      repairCustomerPortalSchema.safeParse({
        ...basePayload,
        budgetValidUntil: "15/08/2026"
      }).success
    ).toBe(false);
  });
});
