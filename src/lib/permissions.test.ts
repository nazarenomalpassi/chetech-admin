import { describe, expect, it } from "vitest";

import { canAccessPath, hasPermission, normalizeAppRole } from "@/lib/permissions";

describe("roles y permisos", () => {
  it("normaliza el rol legado empleado como tecnico", () => {
    expect(normalizeAppRole("empleado")).toBe("tecnico");
    expect(normalizeAppRole("tecnico")).toBe("tecnico");
    expect(normalizeAppRole("admin")).toBe("admin");
  });

  it("no convierte roles del ecommerce ni valores desconocidos en tecnico", () => {
    expect(normalizeAppRole("customer")).toBeNull();
    expect(normalizeAppRole("editor")).toBeNull();
    expect(normalizeAppRole("support")).toBeNull();
    expect(normalizeAppRole("staff")).toBeNull();
    expect(normalizeAppRole(null)).toBeNull();
    expect(normalizeAppRole("otro")).toBeNull();
    expect(hasPermission(null, "repairs.update")).toBe(false);
    expect(canAccessPath(null, "/dashboard")).toBe(false);
  });

  it("mantiene acceso total para admin", () => {
    expect(hasPermission("admin", "sales.manage")).toBe(true);
    expect(canAccessPath("admin", "/configuracion")).toBe(true);
  });

  it("limita al tecnico a dashboard, productos, visitas y reparaciones operativas", () => {
    expect(canAccessPath("tecnico", "/dashboard")).toBe(true);
    expect(canAccessPath("tecnico", "/productos")).toBe(true);
    expect(canAccessPath("tecnico", "/visitas")).toBe(true);
    expect(canAccessPath("tecnico", "/reparaciones-access")).toBe(true);
    expect(canAccessPath("tecnico", "/ventas")).toBe(false);
    expect(canAccessPath("tecnico", "/reparaciones")).toBe(false);
    expect(canAccessPath("tecnico", "/configuracion")).toBe(false);
  });

  it("permite trabajo tecnico pero no administracion", () => {
    expect(hasPermission("tecnico", "repairs.update")).toBe(true);
    expect(hasPermission("tecnico", "visits.update")).toBe(true);
    expect(hasPermission("tecnico", "products.view")).toBe(true);
    expect(hasPermission("tecnico", "products.manage")).toBe(false);
    expect(hasPermission("tecnico", "expenses.manage")).toBe(false);
  });
});
