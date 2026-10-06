// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogShell } from "@/components/ui/dialog-shell";

Object.assign(globalThis, { React });
afterEach(cleanup);

function Form() {
  const [value, setValue] = useState("");
  return (
    <DialogShell labelledBy="title" onClose={() => undefined}>
      <h2 id="title">Prueba</h2>
      <button type="button">Cerrar</button>
      <input aria-label="Presupuesto" onChange={(event) => setValue(event.target.value)} value={value} />
      <button type="button">Guardar</button>
    </DialogShell>
  );
}

describe("DialogShell", () => {
  it("does not steal focus when a controlled input rerenders its parent", () => {
    render(<Form />);
    const input = screen.getByLabelText("Presupuesto");
    input.focus();
    fireEvent.change(input, { target: { value: "15000" } });
    expect(document.activeElement).toBe(input);
  });

  it("uses the latest close callback without resetting focus", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<DialogShell labelledBy="title" onClose={first}><input aria-label="Monto" /></DialogShell>);
    const input = screen.getByLabelText("Monto");
    input.focus();
    rerender(<DialogShell labelledBy="title" onClose={latest}><input aria-label="Monto" /></DialogShell>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(latest).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("traps Tab in the dialog and restores focus and body scroll on unmount", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<Form />);
    const last = screen.getByRole("button", { name: "Guardar" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cerrar" }));
    unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
    opener.remove();
  });
});
