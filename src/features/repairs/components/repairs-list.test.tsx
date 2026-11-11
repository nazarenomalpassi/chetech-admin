// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaginationMeta } from "@/lib/pagination";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";
const actions = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), add: vi.fn(), reverse: vi.fn() }));
vi.mock("../actions", () => ({ saveRepairAction: actions.save, saveRepairFormAction: actions.save, deleteRepairAction: actions.remove, addRepairPaymentAction: actions.add, addRepairPaymentFormAction: actions.add, reverseRepairPaymentAction: actions.reverse }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
import { RepairsList } from "./repairs-list";

const native = { id: "00000000-0000-4000-8000-000000000123", repairNumber: "REP-000123", intakeDate: "2026-09-01", customerName: "Cliente", customerPhone: "123", device: "TV", issueDescription: "No enciende", amount: 80000, paymentMethod: "nx", observations: "" };
const repair = { id: "outside-page", repairAccessOrderId: native.id, repairAccessOrderNumber: "REP-000123", customerName: "Cliente", customerPhone: "123", device: "TV", orderNumber: "REP-000123", issueDescription: "No enciende", finalPrice: 80000, estimatedPrice: 80000, paymentMethod: "nx", status: "pendiente", observations: null, entryDate: "2026-09-01", createdAt: "2026-09-01", paidTotal: 30000, balance: 50000, financialVersion: 4, payments: [{ id: "old-payment", method: "nx", amount: 30000, paymentDate: "2026-10-05", created_at: "2026-10-05" }] };
const props = { canDelete: true, repairs: [], pagination: createPaginationMeta(151, 3, 50), message: null };

describe("REP collection screen opening", () => {
  beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn()); vi.clearAllMocks(); vi.spyOn(window, "confirm").mockReturnValue(true); });
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function expectNoMoneyWritten() { for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled(); }
  it("ignores a slower earlier REP lookup and keeps the most recently requested order", async () => {
    let old!: (response: Response) => void, recent!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { old = resolve; })).mockImplementationOnce(() => new Promise(resolve => { recent = resolve; }));
    const { container } = render(<RepairsList {...props} />);
    const lookup = container.querySelector<HTMLInputElement>('input[name="accessOrderNumber"]')!;
    fireEvent.change(lookup, { target: { value: "123" } }); fireEvent.keyDown(lookup, { key: "Enter" });
    fireEvent.change(lookup, { target: { value: "456" } }); fireEvent.keyDown(lookup, { key: "Enter" });
    const next = { ...native, id: "00000000-0000-4000-8000-000000000456", repairNumber: "REP-000456" };
    recent(new Response(JSON.stringify({ order: next }), { status: 200 }));
    await waitFor(() => expect(lookup.value).toBe("REP-000456"));
    old(new Response(JSON.stringify({ order: native }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(container.querySelector<HTMLInputElement>('input[name="repairAccessOrderId"]')!.value).toBe(next.id);
    expectNoMoneyWritten();
  });
  it("recovers an owner-scoped unsaved payment only after explicit recovery", async () => {
    const initial = { ...props, draftOwnerId: "owner-1", collectionTarget: { order: native, repair: null, error: null } };
    const first = render(<RepairsList {...initial} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Medio 1" }), { target: { value: "mp" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "30000" } });
    first.unmount();
    render(<RepairsList {...initial} />);
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    await waitFor(() => expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("30000"));
    expectNoMoneyWritten();
  });
  it("does not discard an unrecovered payment draft when another ledger is selected", async () => {
    const first = render(<RepairsList {...props} draftOwnerId="owner-1" collectionTarget={{ order: native, repair: null, error: null }} />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "30000" } }); first.unmount();
    const before = JSON.stringify(localStorage);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairsList {...props} draftOwnerId="owner-1" repairs={[repair]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Gestionar cobros" })[0]);
    expect(confirm).toHaveBeenCalledOnce();
    expect(JSON.stringify(localStorage)).toBe(before);
    expect(screen.getByRole("button", { name: "Recuperar" })).toBeTruthy();
    confirm.mockRestore();
  });
  it.each(["select", "edit"])("does not let slow draft-ledger verification replace newer intent: %s", async (intent) => {
    const saved = { fields: { id: "00000000-0000-4000-8000-000000000555", repairAccessOrderId: native.id, accessOrderNumber: native.repairNumber, customerName: "Cliente", customerPhone: "123", device: "TV", orderNumber: native.repairNumber, issueDescription: "No enciende" }, expectedVersion: 4, amount: "80000", entryDate: "2026-09-01", paymentDate: "2026-11-11", payments: [{ method: "efectivo", amount: 0 }], requestId: "00000000-0000-4000-8000-000000000777" };
    localStorage.setItem(getFormDraftStorageKey(`repair-payment:${JSON.stringify(["owner-1", "record-editor"])}`), JSON.stringify(createFormDraftEnvelope(saved)));
    let old!: (response: Response) => void;
    const next = { ...native, id: "00000000-0000-4000-8000-000000000456", repairNumber: "REP-000456" };
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { old = resolve; })).mockResolvedValueOnce(new Response(JSON.stringify({ order: next }), { status: 200 }));
    const { container } = render(<RepairsList {...props} draftOwnerId="owner-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    const lookup = container.querySelector<HTMLInputElement>('input[name="accessOrderNumber"]')!;
    if (intent === "select") {
      fireEvent.change(lookup, { target: { value: "456" } }); fireEvent.keyDown(lookup, { key: "Enter" });
      await waitFor(() => expect(lookup.value).toBe("REP-000456"));
    } else fireEvent.change(container.querySelector<HTMLInputElement>('input[name="customerName"]')!, { target: { value: "Edicion posterior" } });
    old(new Response(JSON.stringify({ order: native, financialRecord: { ...repair, id: saved.fields.id } }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 30));
    if (intent === "select") expect(container.querySelector<HTMLInputElement>('input[name="repairAccessOrderId"]')!.value).toBe(next.id);
    else expect(container.querySelector<HTMLInputElement>('input[name="customerName"]')!.value).toBe("Edicion posterior");
  });
  it("preserves the same operation and inputs on a rejected save and clears its draft after confirmation", async () => {
    actions.save.mockResolvedValueOnce({ success: false, message: "Conexion interrumpida" }).mockResolvedValueOnce({ success: true, repairId: native.id, message: "Guardado" });
    const { container, unmount } = render(<RepairsList {...props} draftOwnerId="owner-1" collectionTarget={{ order: native, repair: null, error: null }} />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "30000" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar registro y cobro" }).closest("form")!);
    await screen.findByText("Conexion interrumpida");
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("30000");
    fireEvent.submit(screen.getByRole("button", { name: "Guardar registro y cobro" }).closest("form")!);
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(2));
    expect(actions.save.mock.calls[0][0].get("requestId")).toBe(actions.save.mock.calls[1][0].get("requestId"));
    await waitFor(() => expect(container.textContent).toContain("Guardado"));
    unmount();
    expect(Object.keys(localStorage).filter(key => key.includes("payment"))).toEqual([]);
  });

  it("opens the linked out-of-page record and ledger instead of preparing a duplicate record", () => {
    const { container } = render(<RepairsList {...props} collectionTarget={{ order: native, repair, error: null }} />);
    const form = new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!);
    expect(form.get("id")).toBe(repair.id);
    expect(form.get("expectedVersion")).toBe("4");
    expect(form.get("repairAccessOrderId")).toBe(native.id);
    expect(screen.getByRole("region", { name: "Cobros acumulativos de la reparacion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar cobro adicional" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Guardar registro y cobro" })).toBeNull();
    expectNoMoneyWritten();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an empty payment method immediately without assuming the quote was collected", () => {
    const { container } = render(<RepairsList {...props} collectionTarget={{ order: native, repair: null, error: null }} />);
    const form = new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!);
    expect(form.get("id")).toBe("");
    expect(form.get("repairAccessOrderId")).toBe(native.id);
    expect(form.get("amount")).toBe("80000");
    expect(form.get("entryDate")).toBe("2026-09-01");
    expect(JSON.parse(String(form.get("paymentsJson")))).toEqual([{ method: "efectivo", amount: 0 }]);
    expect(screen.getByRole("combobox", { name: "Medio 1" })).toBeTruthy();
    expectNoMoneyWritten();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the same bounded existing-record contract when loading a REP manually", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ order: native, financialRecord: repair }), { status: 200 }));
    const { container } = render(<RepairsList {...props} />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[name="accessOrderNumber"]')!, { target: { value: "REP-000123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar orden" }));
    await waitFor(() => expect(new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!).get("id")).toBe(repair.id));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region", { name: "Cobros acumulativos de la reparacion" }).closest('[tabindex="-1"]')));
    expectNoMoneyWritten();
  });

  it("loading a quote keeps a visible account and blank amount until the user enters received money", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ order: native }), { status: 200 }));
    const { container } = render(<RepairsList {...props} />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[name="accessOrderNumber"]')!, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar orden" }));
    await waitFor(() => expect(new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!).get("repairAccessOrderId")).toBe(native.id));
    expect(JSON.parse(String(new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!).get("paymentsJson")))).toEqual([{ method: "efectivo", amount: 0 }]);
    fireEvent.change(screen.getByRole("combobox", { name: "Medio 1" }), { target: { value: "mp" } });
    fireEvent.change(container.querySelector<HTMLInputElement>("#payment-amount-0")!, { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    expect(JSON.parse(String(new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!).get("paymentsJson")))).toEqual([{ method: "mp", amount: 30000 }, { method: "efectivo", amount: 0 }]);
    expectNoMoneyWritten();
  });

  it("routes a paid row to individual payment removal instead of deleting the whole financial record", () => {
    render(<RepairsList {...props} repairs={[repair]} />);
    expect(screen.queryAllByRole("button", { name: "Eliminar" })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Eliminar pago" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Más acciones" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar pago" })[0]);
    expect(screen.getByRole("region", { name: "Cobros acumulativos de la reparacion" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Cobros acumulativos de la reparacion" })).getByRole("button", { name: "Más acciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar pago" }));
    expect(screen.getByRole("textbox", { name: "Motivo para eliminar el pago" })).toBeTruthy();
    expectNoMoneyWritten();
  });
  it("keeps a comma-decimal repair price draft without changing the amount sent or assuming payment", () => {
    const { container } = render(<RepairsList {...props} collectionTarget={{ order: native, repair: null, error: null }} />);
    const price = screen.getByLabelText("Precio de reparacion") as HTMLInputElement;
    fireEvent.change(price, { target: { value: "80000," } });
    expect(price.value).toBe("80000,");
    fireEvent.change(price, { target: { value: "80000,25" } });
    const data = new FormData(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')!.closest("form")!);
    expect(data.get("amount")).toBe("80000.25");
    expect(JSON.parse(String(data.get("paymentsJson")))).toEqual([{ method: "efectivo", amount: 0 }]);
    expectNoMoneyWritten();
  });
});
