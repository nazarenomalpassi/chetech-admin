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
  it("discloses sorting and page size without hiding primary filters or losing their values", () => {
    mocks.query = "search=Cable&status=active&sort=stock&pageSize=50";
    render(<ProductFilters categories={categories} />);
    const disclosure = screen.getByText("Mas opciones").closest("details")!;
    expect(disclosure.open).toBe(false);
    expect(screen.getByLabelText("Ordenar por").closest("details")).toBe(disclosure);
    expect(screen.getByLabelText("Productos por pagina").closest("details")).toBe(disclosure);
    expect(screen.getByLabelText("Buscar productos").closest("details")).toBeNull();
    fireEvent.click(screen.getByText("Mas opciones"));
    expect(disclosure.open).toBe(true);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "price" } });
    expect(mocks.replace).toHaveBeenLastCalledWith("/productos?search=Cable&status=active&sort=price&pageSize=50", { scroll: false });
    expect((screen.getByLabelText("Buscar productos") as HTMLInputElement).value).toBe("Cable");
  });
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
  it("keeps newer keystrokes and trailing spaces when an older request returns", () => {
    const { rerender } = render(<ProductFilters categories={categories} />);
    const input = screen.getByLabelText("Buscar productos") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bel" } });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.change(input, { target: { value: "Belén " } });
    mocks.query = "search=Bel";
    rerender(<ProductFilters categories={categories} />);
    expect(input.value).toBe("Belén ");
    act(() => vi.advanceTimersByTime(400));
    mocks.query = "search=Bel%C3%A9n";
    rerender(<ProductFilters categories={categories} />);
    expect(input.value).toBe("Belén ");
    fireEvent.change(input, { target: { value: "Belén nueva" } });
    expect(input.value).toBe("Belén nueva");
  });
  it("does not let a pending search undo an immediate category or state selection", () => {
    render(<ProductFilters categories={categories} />);
    fireEvent.change(screen.getByLabelText("Buscar productos"), { target: { value: "Cable nuevo" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: categories[0].id } });
    act(() => vi.advanceTimersByTime(400));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "active" } });
    expect(mocks.replace).toHaveBeenLastCalledWith(`/productos?search=Cable+nuevo&category=${categories[0].id}&status=active`, { scroll: false });
  });
  it("consumes a filter-only acknowledgement before later external navigation", () => {
    const { rerender } = render(<ProductFilters categories={categories} />);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "active" } });
    mocks.query = "status=active";
    rerender(<ProductFilters categories={categories} />);
    fireEvent.change(screen.getByLabelText("Buscar productos"), { target: { value: "Nuevo borrador" } });
    mocks.query = "category=" + categories[0].id;
    mocks.replace.mockClear();
    rerender(<ProductFilters categories={categories} />);
    expect((screen.getByLabelText("Buscar productos") as HTMLInputElement).value).toBe("");
    act(() => vi.advanceTimersByTime(400));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("preserves typing entered after clear while its acknowledgement is delayed", () => {
    mocks.query = "search=Belen";
    const { rerender } = render(<ProductFilters categories={categories} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect((screen.getByLabelText("Buscar productos") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Buscar productos"), { target: { value: "Belen nueva" } });
    mocks.query = "";
    rerender(<ProductFilters categories={categories} />);
    expect((screen.getByLabelText("Buscar productos") as HTMLInputElement).value).toBe("Belen nueva");
    act(() => vi.advanceTimersByTime(400));
    expect(mocks.replace).toHaveBeenLastCalledWith("/productos?search=Belen+nueva", { scroll: false });
  });
  it("keeps the clear search when another filter changes before acknowledgement", () => {
    mocks.query = "search=Bel&status=active";
    render(<ProductFilters categories={categories} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "inactive" } });
    expect(mocks.replace).toHaveBeenLastCalledWith("/productos?status=inactive", { scroll: false });
  });
});
