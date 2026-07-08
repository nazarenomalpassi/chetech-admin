import { describe, expect, it } from "vitest";

import { buildProductCategoryChips } from "@/features/products/category-bar";

describe("buildProductCategoryChips", () => {
  it("crea la opcion Todas primero y conserva las categorias con sus contadores", () => {
    const chips = buildProductCategoryChips(
      [
        { id: "cat-cables", name: "Cables" },
        { id: "cat-tv", name: "Televisores" }
      ],
      {
        "cat-cables": 12,
        "cat-tv": 3
      }
    );

    expect(chips[0]).toMatchObject({
      id: "all",
      label: "Todas",
      count: 15,
      icon: "all"
    });

    expect(chips[1]).toMatchObject({
      id: "cat-cables",
      label: "Cables",
      count: 12,
      icon: "cables"
    });
  });

  it("usa icono generico cuando la categoria no tiene match directo", () => {
    const chips = buildProductCategoryChips([{ id: "cat-x", name: "Accesorios raros" }], {
      "cat-x": 4
    });

    expect(chips[1]?.icon).toBe("generic");
  });
});
