// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconciliationPanel } from "./reconciliation-panel";
Object.assign(globalThis, { React });
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("./reconciliation-actions", () => ({ loadCashReconciliationsAction: mocks.load, saveCashReconciliationAction: mocks.save }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks(); mocks.load.mockResolvedValue({ ready: true, records: [], message: "" });
  mocks.save.mockResolvedValue({ success: true, message: "Arqueo cerrado" });
});
const balances = [{ method: "efectivo", balance: 100 }, { method: "nx", balance: 20 }, { method: "mp", balance: 30 }];
describe("usable per-account reconciliation form", () => {
  it("requires explicit counts, shows differences and submits all three accounts", async () => {
    const { container } = render(<ReconciliationPanel today="2026-10-05" balances={balances} />);
    await waitFor(() => expect((screen.getByRole("button", { name: /Cerrar arqueo/ }) as HTMLButtonElement).disabled).toBe(false));
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs.every((input) => input.required && input.value === "")).toBe(true);
    fireEvent.change(inputs[0], { target: { value: "90" } });
    fireEvent.change(inputs[1], { target: { value: "20" } });
    fireEvent.change(inputs[2], { target: { value: "30" } });
    const reasons = screen.getAllByRole("textbox", { name: /Motivo de la diferencia/ }) as HTMLInputElement[];
    expect(reasons[0].required).toBe(true);
    fireEvent.change(reasons[0], { target: { value: "Faltante verificado" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-05", accounts: [
      { method: "efectivo", expected: 100, physical: 90, reason: "Faltante verificado" }, { method: "nx", expected: 20, physical: 20, reason: "" }, { method: "mp", expected: 30, physical: 30, reason: "" }
    ] })));
  });
  it("keeps unavailable or already closed days from being overwritten", async () => {
    mocks.load.mockResolvedValue({ ready: false, records: [], message: "Falta migracion" });
    render(<ReconciliationPanel today="2026-10-05" balances={balances} />);
    await screen.findByText("Falta migracion");
    expect((screen.getByRole("button", { name: /Cerrar arqueo/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
