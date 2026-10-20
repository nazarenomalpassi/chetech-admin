// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardFilters } from "./board-filters";

Object.assign(globalThis, { React });
const navigation = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params
}));

beforeEach(() => {
  vi.useFakeTimers();
  navigation.params = new URLSearchParams("search=BGH&boardType=main&status=pending_release");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it.each(["claim_open", "cancelled"])("adds %s without discarding search or board type", (status) => {
  render(<BoardFilters />);
  fireEvent.change(screen.getByLabelText("Filtrar placas por estado"), { target: { value: status } });
  expect(navigation.replace).toHaveBeenCalledWith(`/placas-tv?search=BGH&boardType=main&status=${status}`);
});

it("retains debounced search, type and existing status functionality", () => {
  render(<BoardFilters />);
  fireEvent.change(screen.getByLabelText("Buscar placas"), { target: { value: "Samsung" } });
  act(() => { vi.advanceTimersByTime(650); });
  expect(navigation.replace).toHaveBeenLastCalledWith("/placas-tv?search=Samsung&boardType=main&status=pending_release");
  fireEvent.change(screen.getByLabelText("Filtrar placas por tipo"), { target: { value: "fuente" } });
  expect(navigation.replace).toHaveBeenLastCalledWith("/placas-tv?search=BGH&boardType=fuente&status=pending_release");
});

it("associates each external label with a unique filter control", () => {
  const { container } = render(<><BoardFilters /><BoardFilters /></>);
  const controls = Array.from(container.querySelectorAll("input, select"));
  expect(new Set(controls.map((control) => control.id)).size).toBe(controls.length);
  for (const control of controls) {
    expect(container.querySelector(`label[for="${control.id}"]`)).toBeTruthy();
  }
});
