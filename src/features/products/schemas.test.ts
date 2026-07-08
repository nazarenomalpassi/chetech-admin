import { describe, expect, it } from "vitest";

import { categorySchema } from "@/features/products/schemas";

describe("categorySchema", () => {
  it("acepta una categoria con prefijo SKU valido", () => {
    const parsed = categorySchema.safeParse({
      name: "Consolas",
      skuPrefix: "CON"
    });

    expect(parsed.success).toBe(true);
  });

  it("rechaza prefijos con caracteres no validos", () => {
    const parsed = categorySchema.safeParse({
      name: "Consolas",
      skuPrefix: "C-1"
    });

    expect(parsed.success).toBe(false);
  });
});
