// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });
vi.mock("@/features/products/actions", () => ({ upsertProductAction: vi.fn() }));
import { ProductFormDialog } from "./product-form-dialog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const product = { id: "1", sku: "CAB-001", name: "Cable", categoryId: null, cost: 10, salePrice: 20, stock: 7, minStock: 1, isActive: true, notes: "" };

it("closes an unchanged edit without a discard prompt", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onClose = vi.fn();
  render(<ProductFormDialog open categories={[]} product={product} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});

it.each(["cancel", "close", "escape"])("protects changed product values on %s", (closeMethod) => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onClose = vi.fn();
  render(<ProductFormDialog open categories={[]} product={product} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cable nuevo" } });
  const close = () => closeMethod === "escape" ? fireEvent.keyDown(document, { key: "Escape" }) : fireEvent.click(screen.getByRole("button", { name: closeMethod === "cancel" ? "Cancelar" : "Cerrar formulario de producto" }));
  close();
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Cable nuevo");
  confirm.mockReturnValue(true);
  close();
  expect(onClose).toHaveBeenCalledOnce();
});

it("discards confirmed changes before reopening the same product", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const props = { categories: [], product, onClose: vi.fn() };
  const { rerender } = render(<ProductFormDialog {...props} open />);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Descartar esto" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  rerender(<ProductFormDialog {...props} open={false} />);
  rerender(<ProductFormDialog {...props} open />);
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(product.name);
});
