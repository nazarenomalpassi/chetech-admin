// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepairAccessCustomersSection } from "./repair-access-customers-section";

Object.assign(globalThis, { React });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { vi.useFakeTimers(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function search() { await act(async () => { await vi.advanceTimersByTimeAsync(250); }); }

describe("customer search feedback", () => {
  it("clearly labels the initial latest-40 cap and does not fetch for short queries", () => {
    render(<RepairAccessCustomersSection customers={[]} search="" onSearchChange={vi.fn()} />);
    expect(screen.getByText(/ultimos 40 clientes/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http", "network"])("shows a friendly %s error, not a false empty result", async (failure) => {
    if (failure === "http") fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "raw secret" }) });
    else fetchMock.mockRejectedValue(new Error("raw secret"));
    render(<RepairAccessCustomersSection customers={[]} search="Ada" onSearchChange={vi.fn()} />);
    await search();
    expect(screen.getByRole("alert").textContent).toMatch(/No se pudo completar la busqueda/i);
    expect(screen.queryAllByText("No encontramos clientes con esa busqueda.")).toHaveLength(0);
    expect(screen.queryByText("raw secret")).toBeNull();
  });
  it("still reports no matches for a successful empty result", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ customers: [] }) });
    render(<RepairAccessCustomersSection customers={[]} search="Ada" onSearchChange={vi.fn()} />);
    await search();
    expect(screen.getAllByText("No encontramos clientes con esa busqueda.")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("aborts cleanup and ignores stale responses when search is cleared", async () => {
    let resolve: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(<RepairAccessCustomersSection customers={[]} search="Ada" onSearchChange={vi.fn()} />);
    await search();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.rerender(<RepairAccessCustomersSection customers={[]} search="" onSearchChange={vi.fn()} />);
    await act(async () => resolve({ ok: true, json: async () => ({ customers: [{ id: "stale", fullName: "Respuesta vieja", createdAt: "2026-10-05" }] }) }));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("Respuesta vieja")).toBeNull();
  });
});
