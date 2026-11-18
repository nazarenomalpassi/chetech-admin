// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });
vi.mock("@/features/tv-boards/actions", () => ({
  upsertTvBoardAction: vi.fn(),
  markTvBoardSoldAction: vi.fn()
}));
import { BoardFormDialog } from "./board-form-dialog";
import { BoardSaleDialog } from "./board-sale-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const board = {
  id: "1",
  brand: "BGH",
  model: "Main",
  boardType: "main" as const,
  price: 100,
  acquisitionCost: null,
  isActive: true
};

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
  render(
    kind === "inventory" ? (
      <BoardFormDialog open board={board} onClose={onClose} />
    ) : (
      <BoardSaleDialog open board={board} onClose={onClose} />
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});

it.each([
  ["inventory", "cancel"],
  ["inventory", "close"],
  ["inventory", "escape"],
  ["sale", "cancel"],
  ["sale", "close"],
  ["sale", "escape"]
])("retains changed %s values on %s when discard is declined", (kind, closeMethod) => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onClose = vi.fn();
  render(
    kind === "inventory" ? (
      <BoardFormDialog open board={board} onClose={onClose} />
    ) : (
      <BoardSaleDialog open board={board} onClose={onClose} />
    )
  );
  const input = screen.getByLabelText(kind === "inventory" ? "Marca" : "Observaciones");
  fireEvent.change(input, { target: { value: "Cambios sin guardar" } });
  if (closeMethod === "escape") fireEvent.keyDown(document, { key: "Escape" });
  else
    fireEvent.click(
      screen.getByRole("button", {
        name:
          closeMethod === "cancel"
            ? "Cancelar"
            : kind === "inventory"
              ? "Cerrar formulario de placa"
              : "Cerrar registro de venta"
      })
    );
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect((input as HTMLInputElement).value).toBe("Cambios sin guardar");
  confirm.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole("button", {
      name: kind === "inventory" ? "Cerrar formulario de placa" : "Cerrar registro de venta"
    })
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it("preselects the open box for a new board and lists the boxes by number", () => {
  const boxes = [
    { id: "11111111-1111-4111-8111-111111111111", number: 1, label: "Estante" },
    { id: "22222222-2222-4222-8222-222222222222", number: 2, label: null }
  ];
  render(<BoardFormDialog boxes={boxes} defaultBoxId={boxes[1].id} onClose={vi.fn()} open />);
  const select = screen.getByLabelText("Caja donde se guarda") as HTMLSelectElement;
  expect(select.value).toBe(boxes[1].id);
  expect([...select.options].map((option) => option.textContent)).toEqual([
    "Sin caja",
    "Caja 1: Estante",
    "Caja 2"
  ]);
});

it("does not show the box field while the boxes are not enabled", () => {
  render(<BoardFormDialog onClose={vi.fn()} open />);
  expect(screen.queryByLabelText("Caja donde se guarda")).toBeNull();
});
