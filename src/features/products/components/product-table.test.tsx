// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductTable } from "@/features/products/components/product-table";

Object.assign(globalThis, { React });
vi.mock("@/features/products/actions", () => ({ deleteProductAction: vi.fn(), toggleProductStatusAction: vi.fn() }));
afterEach(cleanup);
const products = Array.from({ length: 60 }, (_, index) => ({
  id: String(index), sku: `SKU-${index}`, name: `Producto ${index + 1}`, category: "Cables", cost: 1, salePrice: 2,
  stock: 10, minStock: 1, isActive: true
}));

describe("progressive inventory rendering", () => {
  it("shows reserved and available stock without replacing the physical quantity", () => {
    render(<ProductTable canManage={false} onEdit={vi.fn()} products={[{ ...products[0], stock: 7, reservedStock: 3, availableStock: 4 }]} />);
    expect(screen.getAllByText("Fisico 7")).toHaveLength(2);
    expect(screen.getAllByText("Reservado 3")).toHaveLength(2);
    expect(screen.getAllByText("Disponible 4")).toHaveLength(2);
  });
  it("labels missing availability as unconfirmed rather than zero reserved/free stock", () => {
    render(<ProductTable canManage={false} onEdit={vi.fn()} products={[products[0]]} />);
    expect(screen.getAllByText("Disponible sin confirmar")).toHaveLength(2);
    expect(screen.queryAllByText("Reservado 0")).toHaveLength(0);
    expect(screen.queryAllByText("OK")).toHaveLength(0);
  });
  it("renders a complete server page without a second hidden client window", () => {
    render(<ProductTable canManage={false} onEdit={vi.fn()} products={products.slice(0, 50)} pagination={{ page: 2, pageSize: 50, total: 120, totalPages: 3, hasPreviousPage: true, hasNextPage: true }} searchParams={{ search: "cable", status: "active", pageSize: "50" }} />);
    expect(screen.queryAllByText("Producto 50").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Mostrar mas productos/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Siguiente/i }).getAttribute("href")).toBe("/productos?search=cable&status=active&pageSize=50&page=3");
  });
  it("renders 25 products initially instead of the entire catalogue", () => {
    render(<ProductTable canManage={false} onEdit={vi.fn()} products={products} />);
    expect(screen.queryAllByText("Producto 25").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Producto 26")).toHaveLength(0);
  });
  it("loads more on demand without losing products", () => {
    render(<ProductTable canManage={false} onEdit={vi.fn()} products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mas productos/i }));
    expect(screen.queryAllByText("Producto 50").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Producto 51")).toHaveLength(0);
  });
  it("resets the visible window after category or search results change", () => {
    const { rerender } = render(<ProductTable canManage={false} onEdit={vi.fn()} products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mas productos/i }));
    rerender(<ProductTable canManage={false} onEdit={vi.fn()} products={products.slice(1)} />);
    expect(screen.queryAllByText("Producto 27")).toHaveLength(0);
    expect(screen.queryAllByText("Producto 26").length).toBeGreaterThan(0);
  });
  it("keeps the loaded rows and focus after revalidation with unchanged filters", () => {
    const { rerender } = render(<ProductTable canManage={false} filterKey="all" onEdit={vi.fn()} products={products} />);
    const more = screen.getByRole("button", { name: /Mostrar mas productos/i });
    more.focus();
    fireEvent.click(more);
    rerender(<ProductTable canManage={false} filterKey="all" onEdit={vi.fn()} products={products.map(product => ({ ...product, stock: 11 }))} />);
    expect(screen.queryAllByText("Producto 50").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(more);
  });
  it("resets on a changed filter key even when the product ids happen to match", () => {
    const { rerender } = render(<ProductTable canManage={false} filterKey="all" onEdit={vi.fn()} products={products} />);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mas productos/i }));
    rerender(<ProductTable canManage={false} filterKey="Cables" onEdit={vi.fn()} products={products} />);
    expect(screen.queryAllByText("Producto 26")).toHaveLength(0);
  });
});
