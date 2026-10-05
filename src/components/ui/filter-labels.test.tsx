import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductFilters } from "@/features/products/components/product-filters";
import { BoardFilters } from "@/features/tv-boards/components/board-filters";

Object.assign(globalThis, { React });
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
describe("filter accessible names", () => {
  it("names product search, category and status independently", () => {
    const html = renderToStaticMarkup(<ProductFilters categories={[]} />);
    for (const label of ["Buscar productos", "Filtrar productos por categoria", "Filtrar productos por estado"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
  it("names board search, type and status independently", () => {
    const html = renderToStaticMarkup(<BoardFilters />);
    for (const label of ["Buscar placas", "Filtrar placas por tipo", "Filtrar placas por estado"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
