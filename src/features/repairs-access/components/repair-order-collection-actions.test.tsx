// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";
import type { RepairAccessOrderRecord } from "../queries";
import { RepairOrderCollectionActions } from "./repair-order-collection-actions";

const mocks = vi.hoisted(() => ({ save: vi.fn(), add: vi.fn(), deliver: vi.fn(), refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("@/features/repairs/actions", () => ({ saveRepairFormAction: mocks.save, addRepairPaymentFormAction: mocks.add }));
vi.mock("../coordination-actions", () => ({ deliverRepairOrder: mocks.deliver }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
Object.assign(globalThis, { React });

const orderId = "10000000-0000-4000-8000-000000000001";
const financialId = "20000000-0000-4000-8000-000000000001";
const ownerId = "30000000-0000-4000-8000-000000000001";
const order = { id: orderId, repairNumber: "REP-000123", status: "listo_para_retirar", isPaid: false,
  budgetAmount: 999, finalAmount: 999, customer: { fullName: "Cliente" }, device: { accessoryDetails: "Control" },
  workflow: { version: 1, qualityCheckedAt: null } } as RepairAccessOrderRecord;
const lookupOrder = { id: orderId, repairNumber: order.repairNumber, workflowVersion: 9, status: order.status,
  customerName: "Cliente actual", customerPhone: "123", device: "TV actual", issueDescription: "Reparacion actual",
  intakeDate: "2026-11-01", amount: 100, paidTotal: 0, balance: 100 };
const financial = { id: financialId, repairAccessOrderId: orderId, finalPrice: 100, paidTotal: 40, balance: 60, financialVersion: 3 };
function response(financialRecord: typeof financial | null = financial, overrides = {}) {
  return { draftOwnerId: ownerId, order: lookupOrder, financialRecord, ...overrides };
}
function reply(body = response(), ok = true) { return { ok, json: async () => body }; }
function draftKey(id = ownerId, target = orderId) {
  return getFormDraftStorageKey(`repair-payment:${JSON.stringify([id, `workshop-collection:${target}`])}`);
}
function mount(record = order) { return render(<RepairOrderCollectionActions order={record} canManage />); }
async function openCollection() {
  fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
  return screen.findByRole("button", { name: "Confirmar cobro" });
}
function enterPayment(amount: string) {
  fireEvent.change(screen.getByLabelText("Monto"), { target: { value: amount } });
}
function submit() { fireEvent.submit(screen.getByRole("button", { name: "Confirmar cobro" }).closest("form")!); }

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue(reply());
  mocks.add.mockResolvedValue({ success: false, message: "Reintenta el mismo cobro" });
  mocks.save.mockResolvedValue({ success: false, message: "Reintenta el mismo cobro" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("in-place repair collection", () => {
  it("opens read-only with live canonical totals and separate pickup", async () => {
    mount();
    expect(screen.getByRole("button", { name: "Registrar entrega" })).toBeTruthy();
    expect(mocks.fetch).not.toHaveBeenCalled();
    await openCollection();
    const summary = screen.getByRole("region", { name: "Saldo de la orden" });
    expect(within(summary).getByText("Total").nextElementSibling?.textContent).toContain("100");
    expect(within(summary).getByText("Pagado").nextElementSibling?.textContent).toContain("40");
    expect(within(summary).getByText("Saldo").nextElementSibling?.textContent).toContain("60");
    expect(screen.getByText("Cliente actual")).toBeTruthy();
    expect(screen.queryByLabelText("Confirmo que el cliente retiro el equipo")).toBeNull();
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("REP-000123"), expect.objectContaining({ cache: "no-store" }));
  });

  it("submits split accounts to the linked financial record, retaining identical retry IDs", async () => {
    mount(); await openCollection(); enterPayment("20");
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    fireEvent.change(screen.getByLabelText("Medio 2"), { target: { value: "nx" } });
    fireEvent.change(screen.getAllByLabelText("Monto")[1], { target: { value: "10" } });
    submit();
    expect(await screen.findByText("Reintenta el mismo cobro")).toBeTruthy();
    const first = Object.fromEntries(mocks.add.mock.calls[0][0] as FormData);
    expect(first).toMatchObject({ repairId: financialId, requestId: expect.stringMatching(/^[\da-f-]{36}$/) });
    expect(JSON.parse(String(first.paymentsJson))).toEqual([{ method: "efectivo", amount: 20 }, { method: "nx", amount: 10 }]);
    expect(first).not.toHaveProperty("warrantyDays");
    expect(first).not.toHaveProperty("status");
    submit(); await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
    expect(Object.fromEntries(mocks.add.mock.calls[1][0])).toEqual(first);
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar cobro" }).hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getAllByLabelText("Monto")[0], { target: { value: "25" } });
    submit(); await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(3));
    expect((mocks.add.mock.calls[2][0] as FormData).get("requestId")).not.toBe(first.requestId);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("creates only the first financial record from the canonical order, without custody or quote edits", async () => {
    mocks.fetch.mockResolvedValue(reply(response(null)));
    mount(); await openCollection(); enterPayment("25"); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.save.mock.calls[0][0])).toMatchObject({ repairAccessOrderId: orderId, customerName: "Cliente actual",
      customerPhone: "123", device: "TV actual", orderNumber: order.repairNumber, amount: "100", entryDate: "2026-11-01" });
    expect(Object.keys(Object.fromEntries(mocks.save.mock.calls[0][0]))).not.toEqual(expect.arrayContaining(["status", "warrantyDays", "pickedUpAt", "budgetAmount"]));
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it.each(["0", "61"])("does not submit a new invalid collection of %s", async (amount) => {
    mount(); await openCollection(); enterPayment(amount); submit();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("locks editing, dismissal and duplicate submission while pending", async () => {
    let finish!: (value: { success: boolean; message: string }) => void;
    mocks.add.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(); await openCollection(); enterPayment("10"); submit();
    await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
    expect((screen.getByLabelText("Monto").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(mocks.add).toHaveBeenCalledOnce();
    finish({ success: false, message: "No se confirmo" });
    expect(await screen.findByText("No se confirmo")).toBeTruthy();
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("10");
  });

  it.each(["button", "escape", "backdrop"])("confirms unsaved close through %s", async (method) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(); await openCollection(); enterPayment("10");
    if (method === "button") fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    else if (method === "escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeTruthy();
    confirm.mockReturnValue(true); fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears the draft before refresh and blocks another collection until a fresh ledger arrives", async () => {
    let finishLookup!: (value: ReturnType<typeof reply>) => void;
    mocks.fetch.mockResolvedValueOnce(reply()).mockImplementationOnce(() => new Promise((resolve) => { finishLookup = resolve; }));
    mocks.add.mockResolvedValue({ success: true, message: "Cobro registrado", repairId: financialId });
    mocks.refresh.mockImplementation(() => expect(localStorage.getItem(draftKey())).toBeNull());
    mount(); await openCollection(); enterPayment("60"); submit();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Cobrar" }).hasAttribute("disabled")).toBe(true);
    expect(mocks.deliver).not.toHaveBeenCalled();
    finishLookup(reply(response({ ...financial, paidTotal: 100, balance: 0, financialVersion: 4 })));
    const pickup = await screen.findByRole("button", { name: "Continuar con la entrega" });
    fireEvent.click(pickup);
    expect(await screen.findByLabelText("Persona que retira")).toBeTruthy();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("shows no ordinary collection form for an already paid order and offers separate pickup", async () => {
    mocks.fetch.mockResolvedValue(reply(response({ ...financial, paidTotal: 100, balance: 0 })));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(await screen.findByText("Sin saldo pendiente")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar cobro" })).toBeNull();
    expect(screen.queryByLabelText("Monto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar con la entrega" }));
    expect(await screen.findByLabelText("Persona que retira")).toBeTruthy();
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("preserves explicit recovery of an uncertain initial create when the refreshed ledger is paid", async () => {
    mocks.fetch.mockResolvedValue(reply(response(null)));
    const firstMount = mount(); await openCollection(); enterPayment("100"); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const original = Object.fromEntries(mocks.save.mock.calls[0][0]);
    firstMount.unmount(); mocks.save.mockClear();
    mocks.fetch.mockResolvedValue(reply(response({ ...financial, paidTotal: 100, balance: 0 })));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(await screen.findByText("Sin saldo pendiente")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar cobro" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar borrador" }));
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("100");
    expect(mocks.save).not.toHaveBeenCalled();
    submit(); await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.save.mock.calls[0][0])).toEqual(original);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("requires explicit consent to proceed without local storage and retains in-memory retry identity", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    mount(); await openCollection(); enterPayment("10"); submit();
    expect(await screen.findByText(/No se pudo guardar el borrador local/)).toBeTruthy();
    expect(mocks.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Continuar sin borrador local/));
    submit(); await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
    const original = Object.fromEntries(mocks.add.mock.calls[0][0]);
    await screen.findByText("Reintenta el mismo cobro"); submit();
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
    expect(Object.fromEntries(mocks.add.mock.calls[1][0])).toEqual(original);
  });

  it("requires explicit draft recovery and replays a timed-out create as create even after refresh", async () => {
    mocks.fetch.mockResolvedValue(reply(response(null)));
    const firstMount = mount(); await openCollection(); enterPayment("25"); submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const original = Object.fromEntries(mocks.save.mock.calls[0][0]);
    expect(localStorage.getItem(draftKey())).not.toBeNull();
    firstMount.unmount();
    mocks.fetch.mockResolvedValue(reply(response({ ...financial, paidTotal: 25, balance: 75 })));
    mocks.save.mockClear(); mount(); await openCollection();
    expect(await screen.findByRole("button", { name: "Recuperar borrador" })).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar borrador" }));
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("25");
    submit(); await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.save.mock.calls[0][0])).toEqual(original);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it.each(["add", "remove", "zero-account"])("preserves a recovered ADD retry through an unused zero-row %s", async (change) => {
    mocks.fetch.mockResolvedValue(reply(response({ ...financial, paidTotal: 30, balance: 70 })));
    const firstMount = mount(); await openCollection(); enterPayment("20"); submit();
    await screen.findByText("Reintenta el mismo cobro");
    const original = Object.fromEntries(mocks.add.mock.calls[0][0]);
    firstMount.unmount(); mocks.add.mockClear();
    mocks.fetch.mockResolvedValue(reply(response({ ...financial, paidTotal: 50, balance: 50 })));
    mount(); await openCollection();
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar borrador" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    expect(screen.getAllByLabelText("Monto")).toHaveLength(2);
    expect((screen.getAllByLabelText("Monto")[1] as HTMLInputElement).value).toBe("");
    if (change === "remove") fireEvent.click(screen.getByRole("button", { name: "Quitar medio 2" }));
    if (change === "zero-account") fireEvent.change(screen.getByLabelText("Medio 2"), { target: { value: "nx" } });
    expect(screen.getByText(/Borrador recuperado\. Se conserva el intento original/)).toBeTruthy();
    expect(mocks.add).not.toHaveBeenCalled();
    submit(); await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
    const retry = Object.fromEntries(mocks.add.mock.calls[0][0]);
    const businessPayload = (payload: Record<string, FormDataEntryValue>) => ({ ...payload,
      paymentsJson: JSON.stringify(JSON.parse(String(payload.paymentsJson)).filter((payment: { amount: number }) => payment.amount !== 0)) });
    expect(retry.requestId).toBe(original.requestId);
    expect(businessPayload(retry)).toEqual(businessPayload(original));
    expect(JSON.parse(localStorage.getItem(draftKey())!).data.availableBalance).toBe(70);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects recovered payloads that belong to another order", async () => {
    mount(); await openCollection(); enterPayment("10"); submit();
    await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
    const draft = JSON.parse(localStorage.getItem(draftKey())!);
    cleanup();
    draft.data.orderId = "40000000-0000-4000-8000-000000000001";
    localStorage.setItem(draftKey(), JSON.stringify(draft));
    mocks.add.mockClear(); mount(); await openCollection();
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar borrador" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringMatching(/borrador.*orden|orden.*borrador/i));
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("");
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("never offers another owner's local draft", async () => {
    localStorage.setItem(draftKey("different-owner"), JSON.stringify(createFormDraftEnvelope({ amount: 25 })));
    mount(); await openCollection();
    expect(screen.queryByRole("button", { name: "Recuperar borrador" })).toBeNull();
  });

  it.each(["wrong-order", "wrong-financial", "missing-owner", "http-error"])("fails closed for %s lookup", async (scenario) => {
    const body = scenario === "wrong-order" ? response(financial, { order: { ...lookupOrder, id: "wrong" } })
      : scenario === "wrong-financial" ? response({ ...financial, repairAccessOrderId: "wrong" })
      : scenario === "missing-owner" ? response(financial, { draftOwnerId: undefined }) : response();
    mocks.fetch.mockResolvedValue(reply(body, scenario !== "http-error"));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar cobro" })).toBeNull();
    expect(mocks.add).not.toHaveBeenCalled();
  });
});

describe("separate guarded pickup", () => {
  it.each(["listo_para_retirar", "no_presenta_fallas", "sin_solucion", "presupuestado_rechazado"])("offers independent pickup for %s", (status) => {
    mount({ ...order, status });
    expect(screen.getByRole("button", { name: "Registrar entrega" })).toBeTruthy();
  });
  it.each(["en_reparacion", "retirado", "anulado"])("does not offer pickup for %s", (status) => {
    mount({ ...order, status }); expect(screen.queryByRole("button", { name: "Registrar entrega" })).toBeNull();
  });
  it("does not expose collection or pickup to technicians", () => {
    render(<RepairOrderCollectionActions order={order} canManage={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("keeps recipient, confirmations, balance reason and latest version when delivery fails", async () => {
    mocks.deliver.mockResolvedValue({ success: false, message: "La orden cambio" });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    const recipient = await screen.findByLabelText("Persona que retira");
    expect((recipient as HTMLInputElement).required).toBe(true);
    fireEvent.change(recipient, { target: { value: "Familiar" } });
    fireEvent.click(screen.getByLabelText(/Autorizo entrega con saldo pendiente/));
    const notes = screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement;
    expect(notes.required).toBe(true);
    fireEvent.change(notes, { target: { value: "Control devuelto. Saldo autorizado." } });
    fireEvent.click(screen.getByLabelText("Confirmo que el cliente retiro el equipo"));
    fireEvent.submit(screen.getByRole("button", { name: "Confirmar entrega" }).closest("form")!);
    expect(await screen.findByText("La orden cambio")).toBeTruthy();
    expect(Object.fromEntries(mocks.deliver.mock.calls[0][1])).toMatchObject({ id: orderId, version: "9", recipient: "Familiar",
      notes: "Control devuelto. Saldo autorizado.", allowBalance: "on", confirmDelivery: "on" });
    expect((recipient as HTMLInputElement).value).toBe("Familiar"); expect(notes.value).toContain("Saldo autorizado");
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["listo_para_retirar", "no_presenta_fallas", "sin_solucion", "presupuestado_rechazado"])("requires canonical debt authorization despite legacy isPaid=true for %s", async (status) => {
    mocks.fetch.mockResolvedValue(reply(response(financial, { order: { ...lookupOrder, status, isPaid: true, paidTotal: 100, balance: 0 } })));
    mocks.deliver.mockResolvedValue({ success: false, message: "Entrega de prueba sin cambios" });
    mount({ ...order, status, isPaid: true });
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    const authorization = await screen.findByLabelText(/Autorizo entrega con saldo pendiente/);
    expect((authorization as HTMLInputElement).checked).toBe(false);
    const summary = screen.getByRole("region", { name: "Saldo de la orden" });
    expect(within(summary).getByText("Saldo").nextElementSibling?.textContent).toContain("60");
    fireEvent.click(screen.getByLabelText("Confirmo que el cliente retiro el equipo"));
    const form = screen.getByRole("button", { name: "Confirmar entrega" }).closest("form")!;
    fireEvent.submit(form);
    expect(mocks.deliver).not.toHaveBeenCalled();
    fireEvent.click(authorization);
    const notes = screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement;
    expect(notes.required).toBe(true);
    fireEvent.submit(form);
    expect(mocks.deliver).not.toHaveBeenCalled();
    fireEvent.change(notes, { target: { value: "Saldo autorizado por mostrador" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.deliver).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.deliver.mock.calls[0][1])).toMatchObject({ version: "9", allowBalance: "on", confirmDelivery: "on", notes: "Saldo autorizado por mostrador" });
  });
  it("requires explicit no-charge authorization and a reason for an unpaid ready order with zero canonical balance", async () => {
    mocks.fetch.mockResolvedValue(reply(response(null, { order: { ...lookupOrder, amount: 0, paidTotal: 0, balance: 0, isPaid: false } })));
    mocks.deliver.mockResolvedValue({ success: false, message: "Entrega de prueba sin cambios" });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    const authorization = await screen.findByLabelText("Autorizo entrega sin cobros pendientes. Indica el motivo en las observaciones.") as HTMLInputElement;
    expect(authorization.checked).toBe(false);
    expect(authorization.name).toBe("allowBalance");
    expect(screen.queryByLabelText(/Autorizo entrega con saldo pendiente/)).toBeNull();
    const notes = screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement;
    fireEvent.click(screen.getByLabelText("Confirmo que el cliente retiro el equipo"));
    fireEvent.change(notes, { target: { value: "Trabajo sin cargo autorizado" } });
    const form = screen.getByRole("button", { name: "Confirmar entrega" }).closest("form")!;
    fireEvent.submit(form);
    expect(mocks.deliver).not.toHaveBeenCalled();
    fireEvent.click(authorization);
    expect(notes.required).toBe(true);
    expect(notes.minLength).toBe(3);
    fireEvent.change(notes, { target: { value: "No" } });
    fireEvent.submit(form);
    expect(mocks.deliver).not.toHaveBeenCalled();
    fireEvent.change(notes, { target: { value: "Trabajo sin cargo autorizado" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.deliver).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.deliver.mock.calls[0][1])).toMatchObject({ id: orderId, version: "9", allowBalance: "on", confirmDelivery: "on", notes: "Trabajo sin cargo autorizado" });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("does not request authorization for canonical zero balance on a no-fault order", async () => {
    mocks.fetch.mockResolvedValue(reply(response(null, { order: { ...lookupOrder, status: "no_presenta_fallas", amount: 0, paidTotal: 0, balance: 0, isPaid: false } })));
    mount({ ...order, status: "no_presenta_fallas" }); fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    await screen.findByLabelText("Persona que retira");
    expect(screen.queryByLabelText(/Autorizo entrega/)).toBeNull();
    expect((screen.getByLabelText("Accesorios devueltos y observaciones") as HTMLTextAreaElement).required).toBe(false);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("does not request no-charge authorization for a paid ready order with zero canonical balance", async () => {
    mocks.fetch.mockResolvedValue(reply(response({ ...financial, paidTotal: 100, balance: 0 }, { order: { ...lookupOrder, isPaid: true } })));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    await screen.findByLabelText("Persona que retira");
    expect(screen.queryByLabelText(/Autorizo entrega/)).toBeNull();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("rechecks delivery eligibility against the fresh order instead of the card status", async () => {
    mocks.fetch.mockResolvedValue(reply(response(financial, { order: { ...lookupOrder, status: "en_reparacion" } })));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringMatching(/no permite.*entrega/));
    expect(screen.queryByRole("button", { name: "Confirmar entrega" })).toBeNull();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
