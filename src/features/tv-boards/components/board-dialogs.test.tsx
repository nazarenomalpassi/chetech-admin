// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });
vi.mock("@/features/tv-boards/actions", () => ({ upsertTvBoardAction: vi.fn(), markTvBoardSoldAction: vi.fn() }));
import { BoardFormDialog } from "./board-form-dialog";
import { BoardSaleDialog } from "./board-sale-dialog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const board = { id: "1", brand: "BGH", model: "Main", boardType: "main" as const, price: 100, acquisitionCost: null, isActive: true };

it("discards confirmed inventory changes before reopening the same board", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const props = { board, onClose: vi.fn() };
  const { rerender } = render(<BoardFormDialog {...props} open />);
  fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Descartar esto" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  rerender(<BoardFormDialog {...props} open={false} />);
  rerender(<BoardFormDialog {...props} open />);
  expect((screen.getByLabelText("Marca") as HTMLInputElement).value).toBe(board.brand);
});

it.each(["inventory", "sale"])("closes unchanged %s forms without a prompt", (kind) => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onClose = vi.fn();
  render(kind === "inventory" ? <BoardFormDialog open board={board} onClose={onClose} /> : <BoardSaleDialog open board={board} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});

it.each([["inventory", "cancel"], ["inventory", "close"], ["inventory", "escape"], ["sale", "cancel"], ["sale", "close"], ["sale", "escape"]])("retains changed %s values on %s when discard is declined", (kind, closeMethod) => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onClose = vi.fn();
  render(kind === "inventory" ? <BoardFormDialog open board={board} onClose={onClose} /> : <BoardSaleDialog open board={board} onClose={onClose} />);
  const input = screen.getByLabelText(kind === "inventory" ? "Marca" : "Observaciones");
  fireEvent.change(input, { target: { value: "Cambios sin guardar" } });
  if (closeMethod === "escape") fireEvent.keyDown(document, { key: "Escape" });
  else fireEvent.click(screen.getByRole("button", { name: closeMethod === "cancel" ? "Cancelar" : kind === "inventory" ? "Cerrar formulario de placa" : "Cerrar registro de venta" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect((input as HTMLInputElement).value).toBe("Cambios sin guardar");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: kind === "inventory" ? "Cerrar formulario de placa" : "Cerrar registro de venta" }));
  expect(onClose).toHaveBeenCalledOnce();
});
