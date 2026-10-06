// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepairOrderActivity } from "./repair-order-activity";

Object.assign(globalThis, { React });
const orderId = "11111111-1111-4111-8111-111111111111";
const date = "2026-10-05T12:00:00.123456+00:00";
const events = Array.from({ length: 71 }, (_, index) => ({ id: `22222222-2222-4222-8222-${String(71 - index).padStart(12, "0")}`, kind: "update", message: `Movimiento ${71 - index}`, actorName: "Tecnico", createdAt: date }));
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("lazy paged repair activity", () => {
  it("does not issue 30 eager requests when 30 order cards mount", () => {
    render(<>{Array.from({ length: 30 }, (_, index) => <RepairOrderActivity key={index} orderId={orderId} />)}</>);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("loads the latest 20 on opening and can reach all 71 events without truncation or reordering", async () => {
    fetchMock.mockResolvedValueOnce(response({ events: events.slice(0, 20), nextCursor: { date, id: events[19].id } }))
      .mockResolvedValueOnce(response({ events: events.slice(20, 50), nextCursor: { date, id: events[49].id } }))
      .mockResolvedValueOnce(response({ events: events.slice(50), nextCursor: null }));
    render(<RepairOrderActivity orderId={orderId} />);
    fireEvent.click(screen.getByRole("button", { name: "Historial de trabajo" }));
    await screen.findByText("Movimiento 52");
    expect(screen.getByText(/Ultimos 20/)).toBeTruthy();
    expect(new URL(fetchMock.mock.calls[0][0], "https://local.test").searchParams.get("limit")).toBe("20");
    fireEvent.click(screen.getByRole("button", { name: "Cargar anteriores" }));
    await screen.findByText("Movimiento 22");
    const older = new URL(fetchMock.mock.calls[1][0], "https://local.test");
    expect(older.searchParams.get("cursorDate")).toBe(date);
    expect(older.searchParams.get("cursorId")).toBe(events[19].id);
    expect(older.searchParams.get("limit")).toBe("30");
    fireEvent.click(screen.getByRole("button", { name: "Cargar anteriores" }));
    await screen.findByText("Movimiento 1");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(71);
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(events.map((event) => event.message));
    expect(screen.queryByRole("button", { name: "Cargar anteriores" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("retains loaded history on failure and retries the same oldest cursor without leaking raw errors", async () => {
    fetchMock.mockResolvedValueOnce(response({ events: events.slice(0, 20), nextCursor: { date, id: events[19].id } }))
      .mockResolvedValueOnce(response({ error: "private audit note" }, false))
      .mockResolvedValueOnce(response({ events: events.slice(20, 50), nextCursor: null }));
    render(<RepairOrderActivity orderId={orderId} />);
    fireEvent.click(screen.getByRole("button", { name: "Historial de trabajo" }));
    await screen.findByText("Movimiento 52");
    fireEvent.click(screen.getByRole("button", { name: "Cargar anteriores" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Movimiento 71")).toBeTruthy();
    expect(screen.queryByText("private audit note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Movimiento 22");
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0]);
  });
  it("aborts on collapse/unmount and does not display an abort as an error", async () => {
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const view = render(<RepairOrderActivity orderId={orderId} />);
    fireEvent.click(screen.getByRole("button", { name: "Historial de trabajo" }));
    const first = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Historial de trabajo" })); });
    expect(first.aborted).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Historial de trabajo" }));
    const second = fetchMock.mock.calls[1][1].signal as AbortSignal;
    await act(async () => view.unmount());
    expect(second.aborted).toBe(true);
  });
  it("ignores a late response after the order changes", async () => {
    let resolve: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(<RepairOrderActivity orderId={orderId} />);
    fireEvent.click(screen.getByRole("button", { name: "Historial de trabajo" }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.rerender(<RepairOrderActivity orderId="33333333-3333-4333-8333-333333333333" />);
    await act(async () => resolve(response({ events: events.slice(0, 20), nextCursor: null })));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("Movimiento 71")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
