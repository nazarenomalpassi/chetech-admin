// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ModulePageLoading } from "@/components/ui/module-page-loading";
import RootLoading from "@/app/loading";
import AdminLoading from "@/app/(admin)/loading";

Object.assign(globalThis, { React });
afterEach(cleanup);

describe("ModulePageLoading", () => {
  it("shows the original brand inside a decorative television instead of empty tiles", () => {
    const { container } = render(<ModulePageLoading />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    const logo = container.querySelector('img[src="/brand/chetech-horizontal-white.svg"]');
    expect(logo).not.toBeNull();
    expect(logo?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector(".brand-loading-tv")).not.toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("names the requested section without covering or locking navigation", () => {
    const { container } = render(<ModulePageLoading section="Reparaciones" />);
    expect(screen.getByRole("status").textContent).toContain("Cargando Reparaciones");
    expect(container.querySelector('[data-loading-screen="section"]')).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has a server-renderable full-screen fallback for refresh and initial layout loading", () => {
    const { container } = render(<RootLoading />);
    expect(container.querySelector('[data-loading-screen="app"]')).not.toBeNull();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("status").textContent).toContain("Cargando tu espacio de trabajo");
  });

  it("keeps a section fallback for admin routes without their own loader", () => {
    const { container } = render(<AdminLoading />);
    expect(container.querySelector('[data-loading-screen="section"]')).not.toBeNull();
  });
});
