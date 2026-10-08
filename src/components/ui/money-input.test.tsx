// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyInput } from "./money-input";

function Field({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return <><MoneyInput aria-label="Monto" value={value} onValueChange={setValue} /><output>{value}</output></>;
}
describe("currency entry", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("keeps a decimal separator while typing and accepts Argentine commas", () => {
    render(<Field />);
    const input = screen.getByRole("textbox", { name: "Monto" }) as HTMLInputElement;
    expect(input.value).toBe("");
    for (const value of ["15", "15,", "15,5", "15,50"]) {
      fireEvent.change(input, { target: { value } });
      expect(input.value).toBe(value);
    }
    expect(screen.getByRole("status").textContent).toBe("15.5");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("0");
  });
  it("reflects a new external total instead of retaining an old draft", () => {
    const { rerender } = render(<MoneyInput aria-label="Monto" value={10} onValueChange={() => {}} />);
    rerender(<MoneyInput aria-label="Monto" value={200} onValueChange={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("200");
  });
  it("keeps computed cents editable instead of displaying floating-point noise", () => {
    render(<Field initial={1199.9 * 3} />);
    const input = screen.getByRole("textbox", { name: "Monto" }) as HTMLInputElement;
    expect(input.value).toBe("3599.7");
    fireEvent.change(input, { target: { value: "3599." } });
    expect(input.value).toBe("3599.");
    expect(screen.getByRole("status").textContent).toBe("3599");
  });
});
