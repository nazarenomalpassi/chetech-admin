// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => state }));

import { NavigationPending } from "@/components/layout/navigation-pending";

Object.assign(globalThis, { React });
afterEach(() => { cleanup(); state.pending = false; });

describe("NavigationPending", () => {
  it("is silent when the native router is idle", () => {
    const { container } = render(<NavigationPending label="Productos" />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(container.querySelector('[data-pending="false"]')).not.toBeNull();
  });

  it("tracks the native pending state and clears without a timer", () => {
    state.pending = true;
    const { container, rerender } = render(<NavigationPending label="Productos" />);
    expect(screen.getByRole("status").textContent).toBe("Abriendo Productos");
    expect(container.querySelector('[data-pending="true"]')?.getAttribute("aria-hidden")).toBe("true");
    state.pending = false;
    rerender(<NavigationPending label="Productos" />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(container.querySelector('[data-pending="true"]')).toBeNull();
  });
});
