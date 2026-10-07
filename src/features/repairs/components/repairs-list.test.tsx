// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaginationMeta } from "@/lib/pagination";
const actions = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), add: vi.fn(), reverse: vi.fn() }));
vi.mock("../actions", () => ({ saveRepairAction: actions.save, deleteRepairAction: actions.remove, addRepairPaymentAction: actions.add, reverseRepairPaymentAction: actions.reverse }));
import { RepairsList } from "./repairs-list";

const native = { id: "00000000-0000-4000-8000-000000000123", repairNumber: "REP-000123", intakeDate: "2026-09-01", customerName: "Cliente", customerPhone: "123", device: "TV", issueDescription: "No enciende", amount: 80000, paymentMethod: "nx", observations: "" };
const repair = { id: "outside-page", repairAccessOrderId: native.id, repairAccessOrderNumber: "REP-000123", customerName: "Cliente", customerPhone: "123", device: "TV", orderNumber: "REP-000123", issueDescription: "No enciende", finalPrice: 80000, estimatedPrice: 80000, paymentMethod: "nx", status: "pendiente", observations: null, entryDate: "2026-09-01", createdAt: "2026-09-01", paidTotal: 30000, balance: 50000, financialVersion: 4, payments: [{ id: "old-payment", method: "nx", amount: 30000, paymentDate: "2026-10-05", created_at: "2026-10-05" }] };
const props = { canDelete: true, repairs: [], pagination: createPaginationMeta(151, 3, 50), message: null };

describe("REP collection screen opening", () => {
  beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn()); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  function expectNoMoneyWritten() { for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled(); }

  it("opens the linked out-of-page record and ledger instead of preparing a duplicate record", () => {
    const { container } = render(<RepairsList {...props} collectionTarget={{ order: native, repair, error: null }} />);
    const form = new FormData(container.querySelector("form")!);
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
    const form = new FormData(container.querySelector("form")!);
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
    await waitFor(() => expect(new FormData(container.querySelector("form")!).get("id")).toBe(repair.id));
    expectNoMoneyWritten();
  });

  it("loading a quote keeps a visible account and blank amount until the user enters received money", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ order: native }), { status: 200 }));
    const { container } = render(<RepairsList {...props} />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[name="accessOrderNumber"]')!, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar orden" }));
    await waitFor(() => expect(new FormData(container.querySelector("form")!).get("repairAccessOrderId")).toBe(native.id));
    expect(JSON.parse(String(new FormData(container.querySelector("form")!).get("paymentsJson")))).toEqual([{ method: "efectivo", amount: 0 }]);
    fireEvent.change(screen.getByRole("combobox", { name: "Medio 1" }), { target: { value: "mp" } });
    fireEvent.change(container.querySelector<HTMLInputElement>("#payment-amount-0")!, { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    expect(JSON.parse(String(new FormData(container.querySelector("form")!).get("paymentsJson")))).toEqual([{ method: "mp", amount: 30000 }, { method: "efectivo", amount: 50000 }]);
    expectNoMoneyWritten();
  });

  it("routes a paid row to individual payment removal instead of deleting the whole financial record", () => {
    render(<RepairsList {...props} repairs={[repair]} />);
    expect(screen.queryAllByRole("button", { name: "Eliminar" })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar pago" })[0]);
    expect(screen.getByRole("region", { name: "Cobros acumulativos de la reparacion" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Cobros acumulativos de la reparacion" })).getByRole("button", { name: "Eliminar pago" }));
    expect(screen.getByRole("textbox", { name: "Motivo para eliminar el pago" })).toBeTruthy();
    expectNoMoneyWritten();
  });
});
