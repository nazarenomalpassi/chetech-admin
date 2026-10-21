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
  customer: { fullName: "Cliente de prueba" },
  workflow: { version: 1, budgetRevision: 0, approvalStatus: "legacy", approvedAmount: null, qualityCheckedAt: null, qualityNotes: "", parts: [], events: [] }
} as unknown as RepairAccessOrderRecord;

describe("editor unico de reparaciones", () => {
  it("expone garantia y dias sin marcar garantia por defecto", () => {
    render(<RepairQuickEditor order={order} canManage defaultWarrantyDays={90} />);
    expect((screen.getByLabelText("Esta reparacion tiene garantia") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Esta reparacion tiene garantia"));
    expect((screen.getByLabelText("Duracion de garantia en dias") as HTMLInputElement).value).toBe("90");
    expect(screen.getByLabelText("Condiciones especiales de garantia")).toBeTruthy();
  });
  it("no pide donde ni como se confirmo el presupuesto", () => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.click(screen.getByLabelText("El cliente confirmo este presupuesto"));
    expect(screen.queryByLabelText("Como confirmo")).toBeNull();
    expect(screen.queryByLabelText("Como respondio el cliente")).toBeNull();
  });
  it("envia garantia, dias y condiciones en el guardado unico sin cambiar importe ni cobro", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 2 });
    render(<RepairQuickEditor order={order} canManage defaultWarrantyDays={90} />);
    fireEvent.click(screen.getByLabelText("Esta reparacion tiene garantia"));
    fireEvent.change(screen.getByLabelText("Duracion de garantia en dias"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Condiciones especiales de garantia"), { target: { value: "Fuente reparada" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const data = mocks.save.mock.calls[0][1] as FormData;
    expect(data.get("warrantyIncluded")).toBe("1"); expect(data.get("hasWarranty")).toBe("on");
    expect(data.get("warrantyDays")).toBe("30"); expect(data.get("warrantyConditions")).toBe("Fuente reparada");
    expect(data.has("isPaid")).toBe(false); expect(data.has("confirmCustomer")).toBe(false);
  });
  it("no pierde un cambio de garantia al elegir retiro", () => {
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar", isPaid: true }} canManage defaultWarrantyDays={90} />);
    fireEvent.click(screen.getByLabelText("Esta reparacion tiene garantia"));
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    expect((screen.getByRole("button", { name: "Registrar retiro" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("una orden entregada ofrece solo correccion explicita de garantia sin reabrir trabajo", () => {
    render(<RepairQuickEditor order={{ ...order, status: "retirado", pickedUpAt: "2026-10-01T12:00:00Z", deliveredAt: "2026-10-01T12:00:00Z" }} canManage />);
    expect(screen.getByLabelText("Esta reparacion tiene garantia")).toBeTruthy();
    expect(screen.getByLabelText("Motivo de la correccion de garantia")).toBeTruthy();
    expect((screen.getByLabelText("Confirmo la correccion desde el retiro original") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Estado de la orden")).toBeNull();
  });
  it("no ofrece recuperar un borrador de trabajo anterior en la correccion de una orden entregada", async () => {
    localStorage.setItem(getFormDraftStorageKey(`repair-access:workshop:${order.id}`), JSON.stringify(createFormDraftEnvelope({
      expectedVersion: "1", repairAmount: "100", status: "retirado", hasWarranty: "", confirmDelivery: "on"
    })));
    render(<RepairQuickEditor order={{ ...order, status: "retirado", deliveredAt: "2026-10-01T12:00:00Z", pickedUpAt: "2026-10-01T12:00:00Z" }} canManage />);
    await waitFor(() => expect(screen.getByLabelText("Motivo de la correccion de garantia")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Recuperar" })).toBeNull();
  });
  it.each([false, true])("guarda no presenta fallas sin enviar presupuesto ni aprobacion (admin=%s)", async (canManage) => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 2 });
    render(<RepairQuickEditor order={order} canManage={canManage} />);
    fireEvent.change(screen.getByLabelText("Presupuesto"), { target: { value: "999" } });
    fireEvent.change(screen.getByLabelText("Detalle del presupuesto"), { target: { value: "Borrador cambiado" } });
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "no_presenta_fallas" } });
    expect((screen.getByLabelText("Estado de la orden") as HTMLSelectElement).value).toBe("no_presenta_fallas");
    expect(screen.queryByRole("spinbutton", { name: "Presupuesto" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Detalle del presupuesto" })).toBeNull();
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    expect(screen.queryByText(/Pedile a mostrador/)).toBeNull();
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const data = mocks.save.mock.calls[0][1] as FormData;
    for (const key of ["repairAmount", "budgetDetail", "confirmCustomer", "decisionChannel", "decisionNotes", "issueReported"]) expect(data.has(key)).toBe(false);
  });
  it("permite retirar una orden guardada sin fallas y sin cargo sin autorizar saldo", () => {
    render(<RepairQuickEditor order={{ ...order, status: "no_presenta_fallas", budgetAmount: 0, finalAmount: 0, budgetDetail: null }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    expect((screen.getByRole("button", { name: "Registrar retiro" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByLabelText(/Autorizo entrega con saldo pendiente/)).toBeNull();
    expect((screen.getByLabelText("Confirmo que el cliente retiro el equipo") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Persona que retira") as HTMLInputElement).required).toBe(true);
  });
  it("conserva el presupuesto del borrador al salir de no presenta fallas", () => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText("Presupuesto"), { target: { value: "999" } });
    fireEvent.change(screen.getByLabelText("Detalle del presupuesto"), { target: { value: "Borrador cambiado" } });
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "no_presenta_fallas" } });
    const data = new FormData(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    expect(data.has("repairAmount")).toBe(false);
    expect(data.has("budgetDetail")).toBe(false);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "presupuestado" } });
    expect((screen.getByLabelText("Presupuesto") as HTMLInputElement).value).toBe("999");
    expect((screen.getByLabelText("Detalle del presupuesto") as HTMLTextAreaElement).value).toBe("Borrador cambiado");
  });
  it("recupera no presenta fallas sin enviar una aprobacion vieja del borrador", async () => {
    localStorage.setItem(getFormDraftStorageKey(`repair-access:workshop:${order.id}`), JSON.stringify(createFormDraftEnvelope({
      expectedVersion: "1", status: "no_presenta_fallas", repairAmount: "999", budgetDetail: "Borrador cambiado",
      confirmCustomer: "on", decisionChannel: "telefono", decisionNotes: "Autorizacion anterior", qualityChecked: "on"
    })));
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    expect((screen.getByLabelText("Estado de la orden") as HTMLSelectElement).value).toBe("no_presenta_fallas");
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    expect(screen.queryByLabelText("Equipo probado y funcionando")).toBeNull();
    const data = new FormData(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    for (const key of ["repairAmount", "budgetDetail", "confirmCustomer", "decisionChannel", "decisionNotes", "qualityChecked"]) expect(data.has(key)).toBe(false);
  });
  it.each([
    { budgetAmount: 100, finalAmount: 0, hasFinalAmount: false, isPaid: false, debt: true },
    { budgetAmount: 100, finalAmount: 0, hasFinalAmount: true, isPaid: false, debt: true },
    { budgetAmount: 0, finalAmount: 100, isPaid: false, debt: true },
    { budgetAmount: 100, finalAmount: 100, isPaid: true, debt: false },
    { budgetAmount: 0, finalAmount: 0, isPaid: false, debt: false }
  ])("muestra autorizacion de saldo solo ante cargos positivos impagos: %j", (amounts) => {
    render(<RepairQuickEditor order={{ ...order, status: "no_presenta_fallas", ...amounts }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    const authorization = screen.queryByLabelText(/Autorizo entrega con saldo pendiente/);
    expect(Boolean(authorization)).toBe(amounts.debt);
    if (authorization) {
      expect((authorization as HTMLInputElement).checked).toBe(false);
      fireEvent.click(authorization);
      expect((screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement).required).toBe(true);
    }
  });

  it("registra el retiro desde el selector rapido con confirmacion explicita", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Retiro registrado" });
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar", isPaid: true }} canManage />);
    const select = screen.getByLabelText("Estado de la orden") as HTMLSelectElement;
    expect(Array.from(select.options).find((option) => option.value === "retirado")?.textContent).toBe("Retirado por cliente");
    fireEvent.change(select, { target: { value: "retirado" } });
    expect(select.value).toBe("retirado");
    expect((screen.getByLabelText("Persona que retira") as HTMLInputElement).value).toBe("Cliente de prueba");
    expect((screen.getByLabelText("Confirmo que el cliente retiro el equipo") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    fireEvent.click(screen.getByLabelText("Confirmo que el cliente retiro el equipo"));
    fireEvent.submit(screen.getByRole("button", { name: "Registrar retiro" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const data = mocks.save.mock.calls[0][1] as FormData;
    expect(data.get("status")).toBe("retirado");
    expect(data.get("recipient")).toBe("Cliente de prueba");
    expect(data.get("confirmDelivery")).toBe("on");
  });
  it("no ofrece registrar retiros desde una cuenta tecnica", () => {
    render(<RepairQuickEditor order={order} canManage={false} />);
    expect(Array.from((screen.getByLabelText("Estado de la orden") as HTMLSelectElement).options).map((option) => option.value)).not.toContain("retirado");
  });
  it("conserva persona, notas y confirmacion al salir y volver a la opcion de retiro", () => {
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar", isPaid: true }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    fireEvent.change(screen.getByLabelText("Persona que retira"), { target: { value: "Familiar autorizado" } });
    fireEvent.change(screen.getByLabelText("Accesorios devueltos y observaciones"), { target: { value: "Se devuelve control y cable" } });
    fireEvent.click(screen.getByLabelText("Confirmo que el cliente retiro el equipo"));
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "listo_para_retirar" } });
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    expect((screen.getByLabelText("Persona que retira") as HTMLInputElement).value).toBe("Familiar autorizado");
    expect((screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement).value).toBe("Se devuelve control y cable");
    expect((screen.getByLabelText("Confirmo que el cliente retiro el equipo") as HTMLInputElement).checked).toBe(true);
  });
  it("mantiene bloqueada la ficha despues de confirmar retiro hasta que llegue la actualizacion", async () => {
    mocks.save.mockResolvedValue({ success: true, orderClosed: true, message: "Retiro registrado" });
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar", isPaid: true }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    fireEvent.click(screen.getByLabelText("Confirmo que el cliente retiro el equipo"));
    fireEvent.submit(screen.getByRole("button", { name: "Registrar retiro" }).closest("form")!);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByLabelText("Estado de la orden").matches(":disabled")).toBe(true);
    expect(screen.getByText("Guardado. Actualizando la ficha...")).toBeTruthy();
    fireEvent.submit(screen.getByLabelText("Estado de la orden").closest("form")!);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("solicita autorizacion y motivo al retirar con saldo pendiente", () => {
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar" }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    fireEvent.click(screen.getByLabelText(/Autorizo entrega con saldo pendiente/));
    expect((screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement).required).toBe(true);
  });
  it("conserva la autorizacion de entrega del flujo listo para retirar aunque el importe sea cero", () => {
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar", budgetAmount: 0, finalAmount: 0 }} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    expect(screen.getByLabelText(/Autorizo entrega con saldo pendiente/)).toBeTruthy();
  });
  it("conserva los cambios tecnicos y pide guardarlos antes de registrar el retiro", () => {
    render(<RepairQuickEditor order={{ ...order, status: "listo_para_retirar", isPaid: true }} canManage />);
    fireEvent.change(screen.getByLabelText("Avance / trabajo realizado"), { target: { value: "Prueba final completa" } });
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    expect((screen.getByRole("button", { name: "Registrar retiro" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Guarda primero los cambios de presupuesto o trabajo/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "listo_para_retirar" } });
    expect((screen.getByLabelText("Avance / trabajo realizado") as HTMLTextAreaElement).value).toBe("Prueba final completa");
  });
  it("explica que debe estar lista para entrega sin saltar el flujo actual", () => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "retirado" } });
    expect((screen.getByRole("button", { name: "Registrar retiro" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Primero guarda como/)).toBeTruthy();
  });
  it.each(["presupuestado_aceptado", "presupuestado_rechazado"])("ofrece y guarda %s directamente desde la ficha", async (status) => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 2 });
    render(<RepairQuickEditor order={order} canManage />);
    const select = screen.getByLabelText("Estado de la orden") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toContain(status);
    fireEvent.change(select, { target: { value: status } });
    expect(select.value).toBe(status);
    if (status === "presupuestado_aceptado") fireEvent.click(screen.getByLabelText("El cliente confirmo este presupuesto"));
    else expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    expect(screen.queryByLabelText("Como respondio el cliente")).toBeNull();
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const data = mocks.save.mock.calls[0][1] as FormData;
    expect(data.get("status")).toBe(status);
    expect(data.has("decisionChannel")).toBe(false);
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
    expect(screen.getByText(/La aceptacion de este presupuesto ya esta registrada/)).toBeTruthy();
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
    expect(screen.queryByLabelText("Como confirmo")).toBeNull();
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
    expect(payload.has("decisionChannel")).toBe(false);
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
    expect((screen.getByLabelText("El cliente confirmo este presupuesto") as HTMLInputElement).checked).toBe(true);
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
