// @vitest-environment jsdom
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/productos" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

import { Sidebar } from "@/components/layout/sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { sidebarItems, getSidebarItemsForRole } from "@/lib/navigation";

Object.assign(globalThis, { React });
afterEach(() => { cleanup(); route.pathname = "/productos"; });

describe("section navigation loading", () => {
  it.each(sidebarItems)("covers $href with the shared branded fallback", ({ href }) => {
    const path = resolve(process.cwd(), `src/app/(admin)${href}/loading.tsx`);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("<ModulePageLoading section=");
  });

  it("preserves sidebar destinations, active section and native link behavior", () => {
    render(<Sidebar role="admin" />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    for (const item of getSidebarItemsForRole("admin")) {
      const link = within(nav).getByRole("link", { name: item.label });
      expect(link.getAttribute("href")).toBe(item.href);
      expect(link.classList.contains("nav-section-link")).toBe(true);
      expect(link.querySelector(".nav-link-activity")).not.toBeNull();
      expect(link.getAttribute("aria-current")).toBe(item.href === "/productos" ? "page" : null);
    }
    expect(screen.getByRole("button", { name: "Cerrar sesión" }).closest("form")?.getAttribute("action")).toBe("/auth/sign-out");
  });

  it("keeps mobile menu keyboard behavior and the same destinations", () => {
    render(<MobileNavigation role="admin" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const nav = screen.getByRole("navigation", { name: "Navegacion del local" });
    for (const item of getSidebarItemsForRole("admin")) {
      expect(within(nav).getByRole("link", { name: item.label }).getAttribute("href")).toBe(item.href);
    }
    fireEvent.keyDown(nav, { key: "Escape" });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir menú" }));
  });

  it("keeps the clicked mobile link mounted while navigation waits, then closes on arrival", () => {
    const { rerender } = render(<MobileNavigation role="admin" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const link = screen.getByRole("link", { name: "Reparaciones" });
    link.addEventListener("click", event => event.preventDefault());
    fireEvent.click(link);
    expect(screen.getByRole("navigation", { name: "Navegacion del local" })).not.toBeNull();
    expect(link.querySelector(".nav-link-activity")).not.toBeNull();
    route.pathname = "/reparaciones-access";
    rerender(<MobileNavigation role="admin" />);
    expect(screen.queryByRole("navigation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const active = screen.getByRole("link", { name: "Reparaciones" });
    active.addEventListener("click", event => event.preventDefault());
    fireEvent.click(active);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
