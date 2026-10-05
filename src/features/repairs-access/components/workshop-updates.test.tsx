// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), remove: vi.fn(), event: null as null | (() => void), status: null as null | ((value: string) => void) }));
const router = { refresh: mocks.refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/client", () => ({ createClientSupabaseClient: () => ({
  channel: () => { const channel = { on: (_name: unknown, _filter: unknown, callback: () => void) => { mocks.event = callback; return channel; }, subscribe: (callback: (value: string) => void) => { mocks.status = callback; return channel; } }; return channel; },
  removeChannel: mocks.remove
}) }));
import { WorkshopUpdates } from "./workshop-updates";
Object.assign(globalThis, { React });
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.documentElement.removeAttribute("data-unsaved-changes"); });
afterEach(() => { cleanup(); vi.useRealTimers(); document.documentElement.removeAttribute("data-unsaved-changes"); });
describe("sincronizacion del taller", () => {
  it("no repite la consulta inicial y actualiza una pantalla sin edicion", () => {
    render(<WorkshopUpdates />);
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => { mocks.event?.(); vi.advanceTimersByTime(400); });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("no pisa otro borrador aunque llegue la confirmacion de otro formulario", () => {
    render(<WorkshopUpdates />);
    mocks.refresh.mockClear();
    document.documentElement.setAttribute("data-unsaved-changes", "");
    act(() => { window.dispatchEvent(new Event("chetech:workshop-saved")); mocks.event?.(); vi.advanceTimersByTime(400); });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByText(/Tus cambios sin guardar/)).toBeTruthy();
  });
  it("avisa sobre novedades sin reemplazar el formulario editado", () => {
    render(<><WorkshopUpdates /><form data-workshop-form><input aria-label="Avance" /></form></>);
    mocks.refresh.mockClear();
    fireEvent.input(screen.getByLabelText("Avance"), { target: { value: "Probando" } });
    act(() => { mocks.event?.(); vi.advanceTimersByTime(400); });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("pausa pestañas ocultas y limpia la suscripcion al desmontar", () => {
    const view = render(<WorkshopUpdates />);
    mocks.refresh.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => vi.advanceTimersByTime(25000));
    expect(mocks.refresh).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
