import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reparaciones-access"
}));

import { MobileNavigation } from "@/components/layout/mobile-navigation";

Object.assign(globalThis, { React });

describe("MobileNavigation", () => {
  it("muestra la seccion actual junto a la marca", () => {
    const html = renderToStaticMarkup(<MobileNavigation role="admin" />);

    expect(html).toContain('data-testid="mobile-current-section">Reparaciones</span>');
    expect(html).not.toContain("Panel administrativo");
  });
});
