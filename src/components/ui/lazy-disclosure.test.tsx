// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LazyDisclosure } from "@/components/ui/lazy-disclosure";

Object.assign(globalThis, { React });
afterEach(cleanup);

describe("lazy disclosure", () => {
  it("defers hidden form rendering until the panel is opened", () => {
    render(<LazyDisclosure summary="Actualizar trabajo"><input aria-label="Presupuesto" /></LazyDisclosure>);
    expect(screen.queryByLabelText("Presupuesto")).toBeNull();
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByLabelText("Presupuesto")).toBeTruthy();
  });
  it("retains an unsaved draft when closing and reopening", () => {
    render(<LazyDisclosure summary="Actualizar trabajo"><input aria-label="Presupuesto" /></LazyDisclosure>);
    const details = screen.getByText("Actualizar trabajo").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const input = screen.getByLabelText("Presupuesto") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "15000" } });
    details.open = false;
    fireEvent(details, new Event("toggle"));
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect((screen.getByLabelText("Presupuesto") as HTMLInputElement).value).toBe("15000");
  });
});
