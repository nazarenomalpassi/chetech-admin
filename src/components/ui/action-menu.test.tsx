// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./action-menu";

describe("row actions", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("opens outside clipped rows and restores trigger focus with Escape", () => {
    render(<div style={{ overflow: "hidden" }}><ActionMenu><button>Desactivar</button></ActionMenu></div>);
    const trigger = screen.getByRole("button", { name: "Más acciones" });
    fireEvent.click(trigger);
    expect(screen.getByRole("group").parentElement).toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Desactivar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("does not unmount a native form before its submit", () => {
    const submitted = vi.fn((event) => event.preventDefault());
    render(<ActionMenu><form onSubmit={submitted}><button type="submit">Anular</button></form></ActionMenu>);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    expect(submitted).toHaveBeenCalledOnce();
  });
  it("restores row focus after a secondary action closes", () => {
    render(<ActionMenu><button onClick={() => {}}>Desactivar</button></ActionMenu>);
    const trigger = screen.getByRole("button", { name: "Más acciones" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(document.activeElement).toBe(trigger);
  });
});
