// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
Object.assign(globalThis, { React });
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("./product-filters", () => ({ ProductFilters: () => null }));
vi.mock("./product-table", () => ({ ProductTable: ({ onEdit }: { onEdit: (id: string) => void }) => <button onClick={() => onEdit("1")}>Editar seleccionado</button> }));
vi.mock("./product-form-dialog", () => ({ ProductFormDialog: ({ open, product }: { open: boolean; product?: { sku: string; stock: number } | null }) => open ? <p>Formulario {product ? `${product.sku} stock=${product.stock}` : "nuevo"}</p> : null }));
import { ProductsView } from "./products-view";
afterEach(cleanup);
const product = { id: "1", sku: "CAB-001", name: "Cable", category: "Cables", categoryId: "cat", cost: 4, salePrice: 10, stock: 7, reservedStock: 3, availableStock: 4, minStock: 1, isActive: true, notes: "Notes" };
const props = { canManage: true, categories: [], products: [product], pagination: { page: 2, pageSize: 25, total: 60, totalPages: 3, hasPreviousPage: true, hasNextPage: true }, filterParams: {} };
describe("paged products dialog integration", () => {
  it("does not turn an open edit into a new product after page revalidation", () => {
    const { rerender } = render(<ProductsView {...props} />);
    fireEvent.click(screen.getByText("Editar seleccionado"));
    expect(screen.getByText("Formulario CAB-001 stock=7")).toBeTruthy();
    rerender(<ProductsView {...props} products={[]} />);
    expect(screen.getByText("Formulario CAB-001 stock=7")).toBeTruthy();
  });
  it("opens new products without copying the current page's SKU or stock", () => {
    render(<ProductsView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo producto/i }));
    expect(screen.getByText("Formulario nuevo")).toBeTruthy();
  });
});
