import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() })
}));

import { Topbar } from "@/components/layout/topbar";

Object.assign(globalThis, { React });

describe("Topbar", () => {
  it("no muestra un buscador global de modulos", () => {
    const html = renderToStaticMarkup(<Topbar />);

    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("Buscar módulo");
  });

  it("muestra la sección actual y el acceso a una orden nueva para el administrador", () => {
    const html = renderToStaticMarkup(<Topbar role="admin" />);
    expect(html).toContain("Inicio");
    expect(html).toContain('href="/reparaciones-access?view=nueva"');
    expect(renderToStaticMarkup(<Topbar role="tecnico" />)).not.toContain("Nueva orden");
  });
});
