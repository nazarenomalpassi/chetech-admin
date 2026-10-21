// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplenishmentView } from "./replenishment-view";
import type { ReplenishmentData } from "../types";
Object.assign(globalThis, { React });
vi.mock("@/features/replenishment/actions", () => ({ saveReplenishmentItemAction: vi.fn() }));
afterEach(cleanup);
const data: ReplenishmentData = { migrationReady: true, monthKey: "2026-10", monthLabel: "Octubre 2026", items: [], summary: { productCount: 0, quantitySold: 0, historicalCost: 0, suggestedReplacementCost: 0, orderTotal: 0 } };
const item = { productId: "1", productName: "Cable", sku: "CAB-001", quantitySold: 2, stock: 0, currentUnitCost: 5, currentSalePrice: 10, revenue: 20, historicalCost: 10, currentReplacementCost: 10, quantityToOrder: 2, status: "received" as const, notes: "Retirar", supplier: null };
describe("practical monthly orders", () => {
  it("explains the manual plan and links to actual stock and repair workflows even when empty", () => {
    render(<ReplenishmentView data={data} search="" message={null} />);
    expect(screen.getByRole("link", { name: "Revisar menor stock" }).getAttribute("href")).toBe("/productos?sort=stock&status=active");
    expect(screen.getByRole("link", { name: "Ver repuestos de reparaciones" }).getAttribute("href")).toBe("/reparaciones-access?view=ordenes&scope=parts");
    expect(screen.getByText(/No envia compras ni registra gastos/)).toBeTruthy();
    expect(screen.getByText(/Elegi otro mes/)).toBeTruthy();
  });
  it("offers a product-specific next step after receipt, without changing the item form", () => {
    render(<ReplenishmentView data={{ ...data, items: [item] }} search="Cable" message={null} />);
    expect(screen.getAllByRole("link", { name: "Revisar entrada en Productos" }).map(link => link.getAttribute("href"))).toEqual(["/productos?search=CAB-001", "/productos?search=CAB-001"]);
    expect(screen.getAllByLabelText("Notas de Cable").map(input => (input as HTMLInputElement).value)).toEqual(["Retirar", "Retirar"]);
  });
  it("disables planning saves until the module is available", () => {
    render(<ReplenishmentView data={{ ...data, migrationReady: false, items: [item] }} search="" message={null} />);
    expect(screen.getAllByRole("button", { name: "Guardar" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  });
  it("gives repeated mobile and desktop form controls unique ids", () => {
    const { container } = render(<ReplenishmentView data={{ ...data, items: [item, { ...item, productId: "2", productName: "Otro cable" }] }} search="" message={null} />);
    const ids = Array.from(container.querySelectorAll("input[id],select[id]")).map(input => input.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
