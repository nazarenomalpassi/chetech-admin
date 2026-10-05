// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.query) }));
Object.assign(globalThis, { React });
import { ProductFilters } from "./product-filters";
const categories = [{ id: "11111111-1111-4111-8111-111111111111", name: "Cables" }];
beforeEach(() => { mocks.query = ""; mocks.replace.mockReset(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("URL-driven product controls", () => {
  it("preserves pending typed search when a category changes and resets the page", () => {
    mocks.query = "page=4&status=active";
    render(<ProductFilters categories={categories} />);
    fireEvent.change(screen.getByLabelText("Buscar productos"), { target: { value: "Cable nuevo" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: categories[0].id } });
    expect(mocks.replace).toHaveBeenLastCalledWith(`/productos?status=active&search=Cable+nuevo&category=${categories[0].id}`, { scroll: false });
  });
  it("follows browser history without resurrecting an old search draft", () => {
    const { rerender } = render(<ProductFilters categories={categories} />);
    fireEvent.change(screen.getByLabelText("Buscar productos"), { target: { value: "Cable" } });
    act(() => vi.advanceTimersByTime(400));
    mocks.query = "search=Cable";
    rerender(<ProductFilters categories={categories} />);
    mocks.query = "";
    mocks.replace.mockClear();
    rerender(<ProductFilters categories={categories} />);
    expect((screen.getByLabelText("Buscar productos") as HTMLInputElement).value).toBe("");
    act(() => vi.advanceTimersByTime(400));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("controls state selectors after external navigation", () => {
    const { rerender } = render(<ProductFilters categories={categories} />);
    mocks.query = "status=inactive&sort=stock&pageSize=50";
    rerender(<ProductFilters categories={categories} />);
    expect((screen.getByLabelText("Estado") as HTMLSelectElement).value).toBe("inactive");
    expect((screen.getByLabelText("Ordenar por") as HTMLSelectElement).value).toBe("stock");
    expect((screen.getByLabelText("Productos por pagina") as HTMLSelectElement).value).toBe("50");
  });
});
