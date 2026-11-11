// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ add: vi.fn(), reverse: vi.fn() }));
vi.mock("../actions", () => ({ addRepairPaymentAction: actions.add, addRepairPaymentFormAction: actions.add, reverseRepairPaymentAction: actions.reverse }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
import { RepairPaymentsPanel } from "./repair-payments-panel";

const repair = { id: "00000000-0000-4000-8000-000000000001", paidTotal: 30, balance: 70, payments: [{ id: "00000000-0000-4000-8000-000000000002", method: "nx", amount: 30 }] };
describe("repair collection and erroneous payment removal", () => {
  beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("recovers a partial payment draft without submitting and retains its request on a failed save", async () => {
    actions.add.mockResolvedValue({ success: false, message: "Sin conexion" });
    const first = render(<RepairPaymentsPanel repair={repair} canReverse draftOwnerId="owner" />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "40" } });
    first.unmount();
    render(<RepairPaymentsPanel repair={repair} canReverse draftOwnerId="owner" />);
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("40");
    expect(actions.add).not.toHaveBeenCalled();
    const form = screen.getByRole("button", { name: "Registrar cobro adicional" }).closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("Sin conexion");
    fireEvent.submit(form);
    await waitFor(() => expect(actions.add).toHaveBeenCalledTimes(2));
    expect(actions.add.mock.calls[0][0].get("requestId")).toBe(actions.add.mock.calls[1][0].get("requestId"));
  });
  it.each([30, 0])("permits explicit replay of a recovered committed payment when current balance is %s", async (balance) => {
    actions.add.mockResolvedValue({ success: true, repairId: repair.id, message: "Cobro recuperado" });
    const first = render(<RepairPaymentsPanel repair={repair} canReverse draftOwnerId="owner" />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "40" } });
    const operation = first.container.querySelector<HTMLInputElement>('input[name="requestId"]')!.value;
    first.unmount();
    const next = render(<RepairPaymentsPanel repair={{ ...repair, balance, paidTotal: 100 - balance }} canReverse draftOwnerId="owner" />);
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    const button = screen.getByRole("button", { name: "Registrar cobro adicional" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.submit(button.closest("form")!);
    await waitFor(() => expect(actions.add).toHaveBeenCalledOnce());
    expect(actions.add.mock.calls[0][0].get("requestId")).toBe(operation);
    next.unmount();
  });

  it("supports visible account selection and split additional collections without assuming a full collection", () => {
    const { container } = render(<RepairPaymentsPanel repair={repair} canReverse />);
    expect(screen.getByRole("combobox", { name: "Medio 1" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Medio 2" }), { target: { value: "mp" } });
    fireEvent.change(screen.getAllByLabelText("Monto")[1], { target: { value: "30" } });
    const form = container.querySelector('input[name="paymentsJson"]')!.closest("form")!;
    expect(JSON.parse(String(new FormData(form).get("paymentsJson")))).toEqual([{ method: "efectivo", amount: 40 }, { method: "mp", amount: 30 }]);
    expect(actions.add).not.toHaveBeenCalled();
  });

  it("requires a reason and explicit confirmation to remove only the selected payment", () => {
    render(<RepairPaymentsPanel repair={repair} canReverse />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
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
    expect(screen.queryByRole("button", { name: "Eliminar pago" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("button", { name: "Eliminar pago" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar cobro adicional" })).toBeNull();
  });

  it("allows a decimal split that exactly matches the outstanding balance", () => {
    render(<RepairPaymentsPanel repair={{ ...repair, balance: 1100.30 }} canReverse />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500,10" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    fireEvent.change(screen.getAllByLabelText("Monto")[1], { target: { value: "600,20" } });
    expect((screen.getByRole("button", { name: "Registrar cobro adicional" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not expose removal to a non-admin or send native order payments to the wrong RPC", () => {
    const { rerender } = render(<RepairPaymentsPanel repair={repair} canReverse={false} />);
    expect(screen.queryByRole("button", { name: "Eliminar pago" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
    rerender(<RepairPaymentsPanel repair={{ ...repair, payments: [{ ...repair.payments[0], source: "repair_access" }] }} canReverse />);
    expect(screen.queryByRole("button", { name: "Eliminar pago" })).toBeNull();
    expect(actions.reverse).not.toHaveBeenCalled();
  });
  it("protects an entered correction reason on cancel and Escape without changing the payment", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairPaymentsPanel repair={repair} canReverse />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar pago" }));
    fireEvent.change(screen.getByLabelText("Motivo para eliminar el pago"), { target: { value: "Pago duplicado" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Motivo para eliminar el pago") as HTMLInputElement).value).toBe("Pago duplicado");
    confirm.mockReturnValue(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.reverse).not.toHaveBeenCalled();
  });
});
