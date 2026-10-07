// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkshopServerNavigation } from "./workshop-server-navigation";
import type { WorkshopPageInfo } from "../page-queries";

Object.assign(globalThis, { React });
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const pageInfo: WorkshopPageInfo = { total: 67, pageSize: 30, cursor: "page2", nextCursor: "page3", search: "telefono", status: "presupuestado", warranty: "active", scope: "parts" };
const props = { pageInfo, search: pageInfo.search, status: pageInfo.status, warranty: pageInfo.warranty };

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  window.history.replaceState(null, "", "/reparaciones-access?view=ordenes&q=telefono&state=presupuestado&warranty=active&scope=parts&cursor=page2&order=repair-1&custom=keep");
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function pushedParams() { return new URL(router.push.mock.calls.at(-1)![0], window.location.origin).searchParams; }

describe("server order navigation", () => {
  it("cancels the old debounce and does not rewrite an accepted same-route link intent", () => {
    const { rerender } = render(<WorkshopServerNavigation {...props} search="Belén" />);
    const anchor = document.createElement("a");
    anchor.href = "/reparaciones-access?view=ordenes&state=pendiente_revision";
    anchor.addEventListener("click", (event) => event.preventDefault());
    document.body.append(anchor);
    fireEvent.click(anchor);
    rerender(<WorkshopServerNavigation {...props} search="" status="pendiente_revision" warranty="todos" />);
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).not.toHaveBeenCalled();
    anchor.remove();
  });

  it("waits for composition to finish before sending the final query", () => {
    const { rerender } = render(<WorkshopServerNavigation {...props} search="Bel" isComposing />);
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).not.toHaveBeenCalled();
    rerender(<WorkshopServerNavigation {...props} search="Belén " isComposing={false} />);
    act(() => vi.advanceTimersByTime(350));
    const params = new URL(router.replace.mock.calls.at(-1)![0], window.location.origin).searchParams;
    expect(params.get("q")).toBe("Belén ");
  });

  it("does not send the same newer query again when an older response arrives", () => {
    const { rerender } = render(<WorkshopServerNavigation {...props} search="Belén Pérez" />);
    act(() => vi.advanceTimersByTime(350));
    expect(router.replace).toHaveBeenCalledOnce();
    rerender(<WorkshopServerNavigation {...props} search="Belén Pérez" pageInfo={{ ...pageInfo, search: "Bel" }} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).toHaveBeenCalledOnce();
  });

  it("does not overwrite a browser Back intent with a queued filter rewrite", () => {
    render(<WorkshopServerNavigation {...props} search="Belén" />);
    window.history.replaceState(null, "", "/reparaciones-access?view=ordenes&q=Carlos");
    fireEvent(window, new PopStateEvent("popstate"));
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("does not rewrite initial filters", () => {
    render(<WorkshopServerNavigation {...props} />);
    act(() => vi.advanceTimersByTime(500));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("debounces filter changes while preserving scope and unrelated URL parameters", () => {
    const { rerender } = render(<WorkshopServerNavigation {...props} search="pantalla" />);
    act(() => vi.advanceTimersByTime(200));
    rerender(<WorkshopServerNavigation {...props} search="pantalla rota" status="todos" warranty="todos" />);
    act(() => vi.advanceTimersByTime(349));
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    const params = new URL(router.replace.mock.calls.at(-1)![0], window.location.origin).searchParams;
    expect(Object.fromEntries(params)).toEqual({ view: "ordenes", q: "pantalla rota", scope: "parts", custom: "keep" });
    expect(router.replace.mock.calls.at(-1)![1]).toEqual({ scroll: false });
  });

  it("cancels a pending list rewrite when leaving the workspace", () => {
    const { unmount } = render(<WorkshopServerNavigation {...props} search="otra" />);
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps the shared account on all orders unless mine is explicitly selected", () => {
    render(<WorkshopServerNavigation {...props} pageInfo={{ ...pageInfo, scope: "all" }} />);
    const scope = screen.getByRole("combobox", { name: "Vista de trabajo" }) as HTMLSelectElement;
    expect(scope.value).toBe("all");
    fireEvent.change(scope, { target: { value: "mine" } });
    expect(pushedParams().get("scope")).toBe("mine");
    expect(pushedParams().get("cursor")).toBeNull();
    expect(pushedParams().get("order")).toBeNull();
    expect(pushedParams().get("q")).toBe("telefono");
  });

  it("starts the latest typed filters on their first page, not a stale cursor", () => {
    render(<WorkshopServerNavigation {...props} search="pantalla" />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(pushedParams().get("cursor")).toBeNull();
    expect(pushedParams().get("q")).toBe("pantalla");
    expect(pushedParams().get("state")).toBe("presupuestado");
    expect(pushedParams().get("warranty")).toBe("active");
    expect(pushedParams().get("order")).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("uses the next cursor when the current filters are unchanged", () => {
    render(<WorkshopServerNavigation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(pushedParams().get("cursor")).toBe("page3");
    expect(pushedParams().get("scope")).toBe("parts");
  });

  it("returns to the first page with filters and custom parameters intact", () => {
    render(<WorkshopServerNavigation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Primera pagina" }));
    expect(Object.fromEntries(pushedParams())).toEqual({ view: "ordenes", q: "telefono", state: "presupuestado", warranty: "active", scope: "parts", custom: "keep" });
  });

  it("disables next when there is no further page", () => {
    render(<WorkshopServerNavigation {...props} pageInfo={{ ...pageInfo, nextCursor: null }} />);
    expect((screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
