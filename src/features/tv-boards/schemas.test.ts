import { describe, expect, it } from "vitest";

import { tvBoardSaleSchema, tvBoardSchema } from "@/features/tv-boards/schemas";

describe("tvBoardSchema", () => {
  it("valida una placa correcta", () => {
    const parsed = tvBoardSchema.safeParse({
      brand: "BGH",
      model: "BLE3216D",
      boardType: "main",
      price: 45000,
      isActive: true
    });

    expect(parsed.success).toBe(true);
  });

  it("rechaza tipos de placa invalidos", () => {
    const parsed = tvBoardSchema.safeParse({
      brand: "BGH",
      model: "BLE3216D",
      boardType: "panel",
      price: 45000,
      isActive: true
    });

    expect(parsed.success).toBe(false);
  });

  it("acepta placa unica como tipo valido", () => {
    const parsed = tvBoardSchema.safeParse({
      brand: "Philips",
      model: "50PUG7408",
      boardType: "placa_unica",
      price: 78000,
      isActive: true
    });

    expect(parsed.success).toBe(true);
  });
});

describe("tvBoardSaleSchema", () => {
  it("valida una venta real de MercadoLibre", () => {
    const parsed = tvBoardSaleSchema.safeParse({
      id: "b2df7624-f92e-4d4f-86fe-71cde7b9d0d8",
      netAmount: 86450,
      releaseDate: "2026-05-14",
      notes: "Venta express"
    });

    expect(parsed.success).toBe(true);
  });

  it("rechaza montos finales menores o iguales a cero", () => {
    const parsed = tvBoardSaleSchema.safeParse({
      id: "b2df7624-f92e-4d4f-86fe-71cde7b9d0d8",
      netAmount: 0,
      releaseDate: "2026-05-14"
    });

    expect(parsed.success).toBe(false);
  });
});
