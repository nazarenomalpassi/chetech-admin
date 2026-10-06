// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepairQuickEditor } from "./repair-quick-editor";
import type { RepairAccessOrderRecord } from "../queries";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../coordination-actions", () => ({ saveQuickWorkshopForm: mocks.save, saveWorkshopForm: mocks.save }));
Object.assign(globalThis, { React });
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

const order = {
  id: "10000000-0000-4000-8000-000000000001", status: "presupuestado", budgetAmount: 100, budgetDetail: "Fuente", repairProgress: "", isPaid: false,
  workflow: { version: 1, budgetRevision: 0, approvalStatus: "legacy", approvedAmount: null, qualityCheckedAt: null, qualityNotes: "", parts: [], events: [] }
} as unknown as RepairAccessOrderRecord;

describe("editor unico de reparaciones", () => {
  it.each(["presupuestado_aceptado", "presupuestado_rechazado"])("ofrece y guarda %s directamente desde la ficha", async (status) => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 2 });
    render(<RepairQuickEditor order={order} canManage />);
    const select = screen.getByLabelText("Estado de la orden") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toContain(status);
    fireEvent.change(select, { target: { value: status } });
    expect(select.value).toBe(status);
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    expect(screen.getByLabelText("Como respondio el cliente")).toBeTruthy();
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const data = mocks.save.mock.calls[0][1] as FormData;
    expect(data.get("status")).toBe(status);
    expect(data.get("decisionChannel")).toBe("presencial");
  });
  it("no ofrece decisiones del cliente como nuevos estados a la cuenta tecnica", () => {
    render(<RepairQuickEditor order={order} canManage={false} />);
    const values = Array.from((screen.getByLabelText("Estado de la orden") as HTMLSelectElement).options).map((option) => option.value);
    expect(values).not.toContain("presupuestado_aceptado");
    expect(values).not.toContain("presupuestado_rechazado");
  });
  it("pide motivo al cambiar una aceptacion vigente por un rechazo", () => {
    render(<RepairQuickEditor order={{ ...order, status: "presupuestado_aceptado", workflow: { ...order.workflow!, approvalStatus: "accepted" } }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "presupuestado_rechazado" } });
    expect((screen.getByLabelText("Motivo del rechazo") as HTMLTextAreaElement).required).toBe(true);
  });
  it("no vuelve a exigir importe ni motivo sin cargo al editar un presupuesto ya autorizado", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 2 });
    render(<RepairQuickEditor order={{ ...order, status: "presupuestado_aceptado", budgetAmount: 0, workflow: { ...order.workflow!, approvalStatus: "accepted", approvedAmount: 0 } }} canManage />);
    expect((screen.getByLabelText("Presupuesto") as HTMLInputElement).value).toBe("0");
    expect(screen.queryByLabelText("Motivo del trabajo sin cargo")).toBeNull();
    expect(screen.queryByLabelText("Nota de confirmacion (opcional)")).toBeNull();
    expect(screen.getByText("La aceptacion de este presupuesto ya esta registrada.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Avance / trabajo realizado"), { target: { value: "Nota sin cambiar autorizacion" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect((mocks.save.mock.calls[0][1] as FormData).get("repairAmount")).toBe("0");
  });
  it("conserva el cero explicito de un presupuesto rechazado, pero no lo fabrica en una orden nueva", () => {
    const rejected = { ...order, status: "presupuestado_rechazado", budgetAmount: 0, hasBudgetAmount: true, workflow: { ...order.workflow!, budgetRevision: 1, approvalStatus: "rejected", approvedAmount: null } } as RepairAccessOrderRecord;
    const view = render(<RepairQuickEditor order={rejected} canManage />);
    expect((screen.getByLabelText("Presupuesto") as HTMLInputElement).value).toBe("0");
    expect(screen.queryByLabelText("Nota del rechazo (opcional)")).toBeNull();
    expect(screen.getByText("El rechazo de este presupuesto ya esta registrado.")).toBeTruthy();
    view.unmount();
    render(<RepairQuickEditor order={{ ...order, status: "pendiente_revision", budgetAmount: 0 }} canManage />);
    expect((screen.getByLabelText("Presupuesto") as HTMLInputElement).value).toBe("");
  });
  it("recupera el importe, la confirmacion explicita y las pruebas del mismo borrador", async () => {
    localStorage.setItem(getFormDraftStorageKey(`repair-access:workshop:${order.id}`), JSON.stringify(createFormDraftEnvelope({
      expectedVersion: "1", repairAmount: "150", budgetDetail: "Nueva fuente", status: "listo_para_retirar",
      confirmCustomer: "on", qualityChecked: "on", decisionChannel: "telefono", decisionNotes: "Autorizo ayer"
    })));
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    expect((screen.getByLabelText("Presupuesto") as HTMLInputElement).value).toBe("150");
    expect((screen.getByLabelText("El cliente confirmo este presupuesto") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Equipo probado y funcionando") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Como confirmo") as HTMLSelectElement).value).toBe("telefono");
  });
  it("permite guardar presupuesto, confirmacion y listo en un solo formulario", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 2 });
    render(<RepairQuickEditor order={order} canManage />);
    expect((screen.getByLabelText("El cliente confirmo este presupuesto") as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "listo_para_retirar" } });
    fireEvent.click(screen.getByLabelText("El cliente confirmo este presupuesto"));
    fireEvent.click(screen.getByLabelText("Equipo probado y funcionando"));
    const button = screen.getByRole("button", { name: "Guardar y marcar listo" });
    fireEvent.submit(button.closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const payload = mocks.save.mock.calls[0][1] as FormData;
    expect(payload.get("confirmCustomer")).toBe("on");
    expect(payload.get("qualityChecked")).toBe("on");
    expect(payload.get("status")).toBe("listo_para_retirar");
    expect(payload.get("decisionChannel")).toBe("presencial");
    expect(payload.get("operationId")).toBeTruthy();
  });
  it("no ofrece confirmar al cliente desde una cuenta tecnica", () => {
    render(<RepairQuickEditor order={order} canManage={false} />);
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    expect(screen.getByText(/Pedile a mostrador/)).toBeTruthy();
  });
  it("el presupuesto pagado queda protegido y ausente del envio", () => {
    render(<RepairQuickEditor order={{ ...order, isPaid: true }} canManage />);
    const amount = screen.getByLabelText("Presupuesto") as HTMLInputElement;
    expect(amount.disabled).toBe(true);
    expect(new FormData(amount.closest("form")!).has("repairAmount")).toBe(false);
  });
  it("un presupuesto cambiado pide nueva confirmacion y una prueba explicita", () => {
    const accepted = { ...order, status: "en_pruebas", workflow: { ...order.workflow!, approvalStatus: "accepted" as const, qualityCheckedAt: "2026-10-06" } };
    render(<RepairQuickEditor order={accepted} canManage />);
    expect((screen.getByLabelText("Equipo probado y funcionando") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Presupuesto"), { target: { value: "150" } });
    expect((screen.getByLabelText("El cliente confirmo este presupuesto") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Equipo probado y funcionando") as HTMLInputElement).checked).toBe(false);
  });
  it("desmarca la confirmacion cuando se modifica el detalle despues de haberla elegido", () => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.click(screen.getByLabelText("El cliente confirmo este presupuesto"));
    expect(screen.getByLabelText("Como confirmo")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Detalle del presupuesto"), { target: { value: "Otro alcance" } });
    expect((screen.getByLabelText("El cliente confirmo este presupuesto") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Como confirmo")).toBeNull();
  });
  it("conserva el trabajo escrito y no navega si falla el guardado", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "Falta completar las pruebas" });
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText("Avance / trabajo realizado"), { target: { value: "Main reemplazada" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("pruebas"));
    expect((screen.getByLabelText("Avance / trabajo realizado") as HTMLTextAreaElement).value).toBe("Main reemplazada");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
