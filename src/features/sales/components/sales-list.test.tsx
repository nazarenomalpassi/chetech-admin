// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });
vi.mock("@/features/sales/actions", () => ({ saveSaleAction: vi.fn(), deleteSaleAction: vi.fn() }));
vi.mock("@/components/ui/pagination-nav", () => ({ PaginationNav: () => null }));
vi.mock("@/hooks/use-persistent-form-draft", () => ({ usePersistentFormDraft: () => ({ pendingDraft: null, lastSavedAt: null }) }));
import { SalesList } from "./sales-list";
import { deleteSaleAction } from "@/features/sales/actions";
import { formatCurrency } from "@/lib/utils";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = {
  canManageHistory: true,
  sales: [],
  products: [{ id: "cable", label: "CAB-001 Cable", stock: 7, salePrice: 120 }],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
  message: null
};

it("selects a searched product by keyboard and preserves its price and quantity in the cart", () => {
  render(<SalesList {...props} />);
  const search = screen.getByRole("combobox", { name: "Producto" });
  fireEvent.change(search, { target: { value: "CAB" } });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(search.getAttribute("aria-expanded")).toBe("false");
  expect((screen.getByLabelText("Precio unitario") as HTMLInputElement).value).toBe("120");
  fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
  const form = search.closest("form")!;
  expect(JSON.parse((form.querySelector('[name="itemsJson"]') as HTMLInputElement).value)).toEqual([{ productId: "cable", quantity: 2, unitPrice: 120 }]);
  expect(within(form).getByRole("button", { name: "Guardar venta" })).toBeTruthy();
  expect((search as HTMLInputElement).value).toBe("");
});

it("closes suggestions with Escape without submitting the sale", () => {
  render(<SalesList {...props} />);
  const search = screen.getByRole("combobox", { name: "Producto" });
  fireEvent.focus(search);
  expect(search.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(search, { key: "Escape" });
  expect(search.getAttribute("aria-expanded")).toBe("false");
});

it("accepts comma decimals without dropping the price draft or changing sale math", () => {
  render(<SalesList {...props} />);
  const price = screen.getByLabelText("Precio unitario");
  fireEvent.change(price, { target: { value: "120," } });
  expect((price as HTMLInputElement).value).toBe("120,");
  fireEvent.change(price, { target: { value: "120,50" } });
  expect((price as HTMLInputElement).value).toBe("120,50");
  fireEvent.click(screen.getByRole("button", { name: "Agregar al carrito" }));
  const items = JSON.parse((price.closest("form")!.querySelector('[name="itemsJson"]') as HTMLInputElement).value);
  expect(items[0].unitPrice).toBe(120.5);
});

const sale = { id: "sale-1", saleNumber: "V-001", subtotal: 120, costTotal: 50, profitTotal: 70, soldAt: "2026-10-05", notes: "Nota original", payments: [{ method: "efectivo", amount: 100 }, { method: "transferencia", amount: 20 }], items: [{ productId: "cable", productName: "Cable", quantity: 1, unitPrice: 120, total: 120 }] };

it("preserves split payments, date and cart when editing a recorded sale", () => {
  render(<SalesList {...props} sales={[sale]} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
  const form = screen.getByRole("button", { name: "Actualizar venta" }).closest("form")!;
  expect((form.querySelector('[name="id"]') as HTMLInputElement).value).toBe(sale.id);
  expect((screen.getByLabelText("Fecha") as HTMLInputElement).value).toBe(sale.soldAt);
  expect(JSON.parse((form.querySelector('[name="paymentsJson"]') as HTMLInputElement).value)).toEqual(sale.payments);
  expect(JSON.parse((form.querySelector('[name="itemsJson"]') as HTMLInputElement).value)).toEqual([{ productId: "cable", quantity: 1, unitPrice: 120 }]);
});

it("keeps deletion confirmation and the correct sale id inside the action menu", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.mocked(deleteSaleAction).mockClear();
  render(<SalesList {...props} sales={[sale]} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Mas acciones" })[0]);
  const button = within(screen.getByRole("group", { name: "Mas acciones" })).getByRole("button", { name: "Eliminar" });
  expect((button.closest("form")!.querySelector('[name="id"]') as HTMLInputElement).value).toBe(sale.id);
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledWith("Eliminar la venta V-001? Esto restaura stock y borra el historial de cobro.");
  expect(deleteSaleAction).not.toHaveBeenCalled();
});

const boardSale = {
  ...sale, id: "board-sale", tvBoardId: "board-1", saleNumber: "V-002", costTotal: null, profitTotal: null,
  items: [{ productId: null, productName: "Placa Main LG Smart", quantity: 1, unitPrice: 120, total: 120 }]
};

it("shows board sales as immutable with a link to boards rather than edit or delete", () => {
  render(<SalesList {...props} sales={[boardSale]} />);
  expect(screen.getAllByText("Placa Main LG Smart x1")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Mas acciones" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  for (const link of screen.getAllByRole("link", { name: "Ver placa" })) expect(link.getAttribute("href")).toBe("/placas-tv");
  expect(screen.getAllByText("Costo desconocido; margen no calculado")).toHaveLength(2);
});

it("totals only known margins and states how many sales were excluded", () => {
  render(<SalesList {...props} sales={[sale, boardSale]} />);
  const summary = screen.getByText(/En esta pagina:/);
  expect(summary.textContent).toContain(`margen con costos conocidos ${formatCurrency(70)}`);
  expect(screen.getByText(/1 venta\(s\) con costo desconocido, excluidas del margen/)).toBeTruthy();
});

it("keeps known zero board cost distinct from missing cost and protects known-cost board sales too", () => {
  render(<SalesList {...props} sales={[{ ...boardSale, costTotal: 0, profitTotal: 120 }]} />);
  expect(screen.queryByText("Costo desconocido; margen no calculado")).toBeNull();
  expect(screen.getByText(/En esta pagina:/).textContent).toContain(`margen con costos conocidos ${formatCurrency(120)}`);
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
});

it("never offers the product editor for a malformed row without a catalog product", () => {
  render(<SalesList {...props} sales={[{ ...boardSale, tvBoardId: null }]} />);
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
});
