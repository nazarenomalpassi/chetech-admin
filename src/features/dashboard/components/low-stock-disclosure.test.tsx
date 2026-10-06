import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LowStockDisclosure } from "@/features/dashboard/components/low-stock-disclosure";

Object.assign(globalThis, { React });

describe("LowStockDisclosure", () => {
  it("renders a closed, accessible disclosure with the stock alert count", () => {
    const markup = renderToStaticMarkup(
      <LowStockDisclosure
        products={[{ id: "product-1", name: "Cable HDMI", stock: 0, min_stock: 2 }]}
      />
    );

    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
    expect(markup).toContain("<summary");
    expect(markup).toContain("1 alerta");
    expect(markup).toContain("Cable HDMI");
  });
});
