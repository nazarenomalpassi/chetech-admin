// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmProvider, confirmSubmit, confirmThen } from "./confirm-dialog";

Object.assign(globalThis, { React });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("confirmación", () => {
  it("sin proveedor usa la confirmación nativa de forma sincrónica", () => {
    const native = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onConfirm = vi.fn();
    confirmThen({ title: "¿Anular?", description: "Detalle" }, onConfirm);
    expect(native).toHaveBeenCalledWith("¿Anular?\n\nDetalle");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("con proveedor muestra el diálogo y ejecuta solo al confirmar", async () => {
    const native = vi.spyOn(window, "confirm");
    const onConfirm = vi.fn();
    render(<ConfirmProvider />);
    act(() => confirmThen({ title: "¿Anular la orden?", confirmLabel: "Anular" }, onConfirm));
    expect(await screen.findByText("¿Anular la orden?")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(native).not.toHaveBeenCalled();
  });

  it("al cancelar no ejecuta la acción", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmProvider />);
    act(() => confirmThen({ title: "¿Descartar?" }, onConfirm, onCancel));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirmSubmit frena el envío y lo repite al confirmar", async () => {
    const submitted = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(
      <>
        <ConfirmProvider />
        <form
          onSubmit={(event) => {
            confirmSubmit(event, { title: "¿Eliminar el gasto?", confirmLabel: "Eliminar" });
            if (!event.defaultPrevented) submitted(event);
          }}
        >
          <button type="submit">Enviar</button>
        </form>
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(submitted).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});
