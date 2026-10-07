// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ add: vi.fn(), reverse: vi.fn() }));
vi.mock("../actions", () => ({ addRepairPaymentAction: actions.add, reverseRepairPaymentAction: actions.reverse }));
import { RepairPaymentsPanel } from "./repair-payments-panel";

const repair = { id: "00000000-0000-4000-8000-000000000001", paidTotal: 30, balance: 70, payments: [{ id: "00000000-0000-4000-8000-000000000002", method: "nx", amount: 30 }] };
describe("repair collection and erroneous payment removal", () => {
  beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("supports visible account selection and split additional collections without assuming a full collection", () => {
    const { container } = render(<RepairPaymentsPanel repair={repair} canReverse />);
    expect(screen.getByRole("combobox", { name: "Medio 1" })).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Monto" }), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Medio 2" }), { target: { value: "mp" } });
    const form = container.querySelector('input[name="paymentsJson"]')!.closest("form")!;
    expect(JSON.parse(String(new FormData(form).get("paymentsJson")))).toEqual([{ method: "efectivo", amount: 40 }, { method: "mp", amount: 30 }]);
    expect(actions.add).not.toHaveBeenCalled();
  });

  it("requires a reason and explicit confirmation to remove only the selected payment", () => {
    render(<RepairPaymentsPanel repair={repair} canReverse />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar pago" }));
    expect(screen.getByRole("dialog", { name: "Eliminar pago incorrecto" })).toBeTruthy();
    const reason = screen.getByRole("textbox", { name: "Motivo para eliminar el pago" }) as HTMLInputElement;
    expect(reason.required).toBe(true);
    expect(reason.minLength).toBe(3);
    const form = reason.closest("form")!;
    const data = new FormData(form);
    expect(data.get("repairId")).toBe(repair.id);
    expect(data.get("paymentId")).toBe(repair.payments[0].id);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.reverse).not.toHaveBeenCalled();
  });

  it("keeps removal available for a fully collected repair without allowing an extra collection", () => {
    render(<RepairPaymentsPanel repair={{ ...repair, balance: 0 }} canReverse />);
    expect(screen.getByRole("button", { name: "Eliminar pago" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar cobro adicional" })).toBeNull();
  });

  it("allows a decimal split that exactly matches the outstanding balance", () => {
    render(<RepairPaymentsPanel repair={{ ...repair, balance: 1100.30 }} canReverse />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Monto" }), { target: { value: "500.10" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "Monto" })[1], { target: { value: "600.20" } });
    expect((screen.getByRole("button", { name: "Registrar cobro adicional" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not expose removal to a non-admin or send native order payments to the wrong RPC", () => {
    const { rerender } = render(<RepairPaymentsPanel repair={repair} canReverse={false} />);
    expect(screen.queryByRole("button", { name: "Eliminar pago" })).toBeNull();
    rerender(<RepairPaymentsPanel repair={{ ...repair, payments: [{ ...repair.payments[0], source: "repair_access" }] }} canReverse />);
    expect(screen.queryByRole("button", { name: "Eliminar pago" })).toBeNull();
    expect(actions.reverse).not.toHaveBeenCalled();
  });
});
