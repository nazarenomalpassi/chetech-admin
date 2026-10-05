import { describe, expect, it } from "vitest";

import {
  getNextWorkshopVisibleLimit,
  getVisibleWorkshopOrders
} from "@/features/repairs-access/workshop-list-visibility";

describe("workshop list progressive rendering", () => {
  it("renderiza solo el bloque visible sin perder el historial filtrado", () => {
    const orders = Array.from({ length: 80 }, (_, index) => ({ id: String(index) }));

    expect(getVisibleWorkshopOrders(orders, 36)).toHaveLength(36);
    expect(orders).toHaveLength(80);
  });

  it("avanza por bloques y nunca supera el total", () => {
    expect(getNextWorkshopVisibleLimit(36, 80)).toBe(72);
    expect(getNextWorkshopVisibleLimit(72, 80)).toBe(80);
  });
});
