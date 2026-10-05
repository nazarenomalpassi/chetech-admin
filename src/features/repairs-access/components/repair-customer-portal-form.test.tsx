import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RepairCustomerPortalForm } from "@/features/repairs-access/components/repair-customer-portal-form";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";

Object.assign(globalThis, { React });

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  repairProgress: "Tiras LED compradas.",
  publicProgress: "Texto público anterior.",
  publicNextStep: "Te avisaremos cuando esté listo.",
  budgetAmount: 120000,
  budgetDetail: "Cambio de retroiluminación.",
  publicBudgetDescription: "Descripción pública anterior.",
  budgetVisibleToCustomer: false,
  budgetValidUntil: "2026-08-15",
  customerActionRequired: false,
  customerPortalLinked: true,
  storefrontCustomer: {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Carlos Selección",
    email: "carlos@example.com",
    phone: "3571999999",
  },
  lastCustomerVisibleUpdateAt: null,
} as RepairAccessOrderRecord;

describe("RepairCustomerPortalForm", () => {
  it("muestra y conserva como autoritativos los datos del formulario de trabajo", () => {
    const html = renderToStaticMarkup(
      <RepairCustomerPortalForm order={order} />,
    );

    expect(html).toContain("Publicación automática");
    expect(html).toContain("Tiras LED compradas.");
    expect(html).toContain("120.000");
    expect(html).toContain("Cambio de retroiluminación.");

    expect(html).toMatch(
      /<input(?=[^>]*name="publicProgress")(?=[^>]*type="hidden")(?=[^>]*value="Tiras LED compradas\.")[^>]*>/,
    );
    expect(html).toMatch(
      /<input(?=[^>]*name="publicBudgetDescription")(?=[^>]*type="hidden")(?=[^>]*value="Cambio de retroiluminación\.")[^>]*>/,
    );
    expect(html).toMatch(
      /<input(?=[^>]*name="budgetVisibleToCustomer")(?=[^>]*type="hidden")(?=[^>]*value="on")[^>]*>/,
    );
    expect(html).not.toContain("Texto público anterior.");
    expect(html).not.toContain("Descripción pública anterior.");
    expect(html).not.toMatch(/<textarea[^>]*name="publicProgress"/);
    expect(html).not.toMatch(
      /<input(?=[^>]*name="budgetVisibleToCustomer")(?=[^>]*type="checkbox")[^>]*>/,
    );
  });

  it("mantiene editables únicamente los datos complementarios del portal", () => {
    const html = renderToStaticMarkup(
      <RepairCustomerPortalForm order={order} />,
    );

    expect(html).toMatch(/<textarea[^>]*name="publicNextStep"/);
    expect(html).toMatch(
      /<input(?=[^>]*name="customerActionRequired")(?=[^>]*type="checkbox")[^>]*>/,
    );
    expect(html).toMatch(
      /<input(?=[^>]*name="budgetValidUntil")(?=[^>]*type="date")[^>]*>/,
    );
    expect(html).toMatch(
      /<input(?=[^>]*name="publishUpdate")(?=[^>]*type="checkbox")[^>]*>/,
    );
  });
});
