// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WarrantyReturnsSection } from "./warranty-returns-section";
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./warranty-return-panel", () => ({ WarrantyReturnCase: () => <p>Ficha de garantia</p> }));
Object.assign(globalThis, { React });
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, "", "/reparaciones-access"); });
const page = { items: [], total: 65, activeCount: 12, page: 2, pageSize: 30 };

describe("warranty inbox", () => {
  it("explicitly associates the unique search input with its label", () => {
    render(<WarrantyReturnsSection data={page} search="" closed={false} canManage />);
    const input = screen.getByLabelText("Buscar reingresos") as HTMLInputElement;
    expect(input.id).toBeTruthy();
    expect(input.labels?.[0].htmlFor).toBe(input.id);
    expect(input.labels?.[0].contains(input)).toBe(false);
  });
  it("scopes search to wq and resets only warranty pagination", () => {
    window.history.replaceState(null, "", "/reparaciones-access?view=garantias&q=original&state=retirado&cursor=keep&wp=2&wh=1");
    render(<WarrantyReturnsSection data={page} search="" closed canManage />);
    fireEvent.change(screen.getByLabelText("Buscar reingresos"), { target: { value: "REP-513" } });
    fireEvent.submit(screen.getByRole("button", { name: "Buscar" }).closest("form")!);
    const url = new URL(router.push.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("wq")).toBe("REP-513");
    expect(url.searchParams.get("wp")).toBeNull();
    expect(url.searchParams.get("wh")).toBe("1");
    expect(url.searchParams.get("q")).toBe("original");
    expect(url.searchParams.get("cursor")).toBe("keep");
  });

  it("uses separate active and returned-history filters with accessible current state", () => {
    window.history.replaceState(null, "", "/reparaciones-access?view=garantias&wq=TV&wp=2");
    render(<WarrantyReturnsSection data={page} search="TV" closed={false} canManage={false} />);
    expect(screen.getByRole("button", { name: "Activos (12)" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Historial de retirados" }));
    const url = new URL(router.push.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("wh")).toBe("1");
    expect(url.searchParams.get("wp")).toBeNull();
    expect(url.searchParams.get("wq")).toBe("TV");
  });

  it("paginates within the same warranty filters", () => {
    window.history.replaceState(null, "", "/reparaciones-access?view=garantias&wq=TV&wh=1");
    render(<WarrantyReturnsSection data={page} search="TV" closed canManage />);
    expect(screen.getByText("Pagina 2 de 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    const url = new URL(router.push.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("wp")).toBe("3");
    expect(url.searchParams.get("wh")).toBe("1");
    expect(url.searchParams.get("wq")).toBe("TV");
  });

  it("offers a first-page reset when closing a return empties the last page", () => {
    window.history.replaceState(null, "", "/reparaciones-access?view=garantias&wq=TV&wp=2");
    render(<WarrantyReturnsSection data={{ ...page, total: 30 }} search="TV" closed={false} canManage />);
    expect(screen.getByText("No hay reingresos en esta pagina.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a la primera pagina" }));
    const url = new URL(router.push.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("wp")).toBeNull();
    expect(url.searchParams.get("wq")).toBe("TV");
  });

  it("does not overwrite newer search typing on a delayed server response", () => {
    const { rerender } = render(<WarrantyReturnsSection data={page} search="TV" closed={false} canManage />);
    fireEvent.change(screen.getByLabelText("Buscar reingresos"), { target: { value: "TV nueva" } });
    rerender(<WarrantyReturnsSection data={page} search="TV vieja" closed={false} canManage />);
    expect((screen.getByLabelText("Buscar reingresos") as HTMLInputElement).value).toBe("TV nueva");
  });

  it("distinguishes loading from an actually empty inbox", () => {
    const { rerender } = render(<WarrantyReturnsSection data={null} search="" closed={false} canManage />);
    expect(screen.getByRole("status").textContent).toContain("Cargando");
    rerender(<WarrantyReturnsSection data={{ ...page, page: 1, total: 0 }} search="" closed={false} canManage />);
    expect(screen.getByText("No hay reingresos activos.")).toBeTruthy();
  });
});
