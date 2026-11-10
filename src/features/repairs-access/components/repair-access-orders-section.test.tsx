// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepairAccessOrdersSection } from "./repair-access-orders-section";
import { cancelRepairAccessOrderAction } from "../actions";
import type { RepairAccessOrderRecord } from "../queries";
import type { WarrantyReturnRecord } from "../warranty-return";

Object.assign(globalThis, { React });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.removeAttribute("data-unsaved-changes"); });
vi.mock("../actions", () => ({ cancelRepairAccessOrderAction: vi.fn() }));
vi.mock("./repair-access-workshop-card", () => ({
  RepairAccessWorkshopCard: ({ order, canManageIntake, onOpenDetail }: { order: RepairAccessOrderRecord; canManageIntake: boolean; onOpenDetail: (order: RepairAccessOrderRecord) => void }) =>
    <article aria-label={order.repairNumber}><form data-workshop-form><input aria-label={`Avance ${order.repairNumber}`} /></form>{canManageIntake ? <button onClick={() => onOpenDetail(order)}>Ficha {order.repairNumber}</button> : null}</article>
}));
vi.mock("./repair-access-whatsapp-actions", () => ({ RepairAccessWhatsAppButton: () => <button>WhatsApp</button> }));
vi.mock("./repair-quick-editor", () => ({ RepairQuickEditor: ({ order }: { order: RepairAccessOrderRecord }) => <form data-workshop-form><input aria-label="Avance rapido" defaultValue={order.repairProgress ?? ""} /></form> }));
vi.mock("./warranty-return-panel", () => ({ WarrantyReturnCase: ({ record }: { record: WarrantyReturnRecord }) =>
  <form aria-label="Actualizar visita de garantia"><input name="id" type="hidden" value={record.id} /><p>{record.issueReported}</p><button>Guardar reingreso</button></form>
}));

function makeOrder(index = 1): RepairAccessOrderRecord {
  return {
    id: `order-${index}`, repairNumber: `REP-${String(index).padStart(6, "0")}`, status: "pendiente_revision",
    intakeDate: "2026-10-06", budgetAmount: 100, finalAmount: 0, issueReported: "No enciende", isPaid: false,
    customer: { fullName: "Ana Perez", phone: "1155555555", alternatePhone: "", dni: "1234" },
    device: { deviceType: "Telefono", brand: "Samsung", model: "A10", serialNumber: "serie-1" },
    warranty: { code: "none", label: "Sin garantia", expiresOn: null }
  } as RepairAccessOrderRecord;
}
const orders = [makeOrder()];
const props = { orders, search: "", statusFilter: "todos", warrantyFilter: "todos", onSearchChange: vi.fn(), onStatusFilterChange: vi.fn(), onWarrantyFilterChange: vi.fn(), onEdit: vi.fn(), onOpenDetail: vi.fn(), canManageIntake: true };

function warrantyOrder(): RepairAccessOrderRecord {
  return { ...makeOrder(), status: "retirado", deliveredAt: "2026-10-01T12:00:00Z", warrantyReturns: [{
    id: "return-1", orderId: "order-1", repairNumber: "REP-000001", customerName: "Ana Perez", deviceLabel: "Telefono Samsung A10",
    receivedOn: "2026-11-10", issueReported: "La pantalla se apaga al calentarse", accessories: "Control", conditionNotes: "Sin golpes",
    status: "en_revision", progress: "Revisando flex de pantalla", resolution: "", closedAt: null, recipient: null,
    version: 2, createdAt: "2026-11-10T12:00:00Z"
  }] };
}

describe("order workspace list", () => {
  it("keeps active returns and original custody visible under pending collection", () => {
    const record = warrantyOrder();
    const { rerender } = render(<RepairAccessOrdersSection {...props} orders={[record]} warrantyFilter="pending_delivery" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
    rerender(<RepairAccessOrdersSection {...props} orders={[makeOrder()]} warrantyFilter="pending_delivery" />);
    expect(screen.getByRole("article")).toBeTruthy();
  });
  it("finds original workshop progress with the same corpus as the server", () => {
    const record = { ...makeOrder(), repairProgress: "Fuente recibida, pasar a pruebas" };
    render(<RepairAccessOrdersSection {...props} orders={[record]} search="fuente recibida" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
  });
  it("filters an active warranty visit by its current status rather than the original delivery", () => {
    const record = warrantyOrder();
    const { rerender } = render(<RepairAccessOrdersSection {...props} orders={[record]} statusFilter="en_revision" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
    rerender(<RepairAccessOrdersSection {...props} orders={[record]} statusFilter="retirado" />);
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("finds the actual warranty issue and progress without losing original-issue search", () => {
    const record = warrantyOrder();
    const { rerender } = render(<RepairAccessOrdersSection {...props} orders={[record]} search="pantalla se apaga" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
    rerender(<RepairAccessOrdersSection {...props} orders={[record]} search="flex de pantalla" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
    rerender(<RepairAccessOrdersSection {...props} orders={[record]} search="no enciende" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
  });

  it("keeps the same focused input and unmodified composition text through refreshed records", () => {
    const onSearchChange = vi.fn();
    const onSearchCompositionChange = vi.fn();
    const { rerender } = render(<RepairAccessOrdersSection {...props} onSearchChange={onSearchChange} onSearchCompositionChange={onSearchCompositionChange} search="Bel" />);
    const input = screen.getByRole("textbox", { name: "Buscar orden de service" }) as HTMLInputElement;
    input.focus();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "Belén " } });
    expect(onSearchChange).toHaveBeenLastCalledWith("Belén ");
    rerender(<RepairAccessOrdersSection {...props} onSearchChange={onSearchChange} onSearchCompositionChange={onSearchCompositionChange} search="Belén " orders={[makeOrder(2)]} />);
    fireEvent.compositionEnd(input);
    expect(screen.getByRole("textbox", { name: "Buscar orden de service" })).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Belén ");
    expect(onSearchCompositionChange.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps warranty work separate from the original budget in table presentation", () => {
    const record = { ...warrantyOrder(), workflow: { version: 8 } } as RepairAccessOrderRecord;
    render(<RepairAccessOrdersSection {...props} orders={[record]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver tabla" }));
    expect(screen.getByText("Reingreso por garantia activo")).toBeTruthy();
    expect(screen.getByText("Falla original: No enciende")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("En revision")).toBeTruthy();
    expect(screen.queryByText("Actualizar trabajo")).toBeNull();
    expect(screen.getByRole("form", { name: "Actualizar visita de garantia" }).querySelector('input[name="id"]')?.getAttribute("value")).toBe("return-1");
    expect(screen.queryByLabelText("Avance rapido")).toBeNull();
  });

  it("matches names with accents and repeated spaces without changing the actual search input", () => {
    const record = { ...makeOrder(), customer: { ...makeOrder().customer, fullName: "Belén Pérez" } };
    render(<RepairAccessOrdersSection {...props} orders={[record]} search="belen   perez " />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Buscar orden de service" }) as HTMLInputElement).value).toBe("belen   perez ");
  });

  it("does not hide server matches on diagnosis or budget detail", () => {
    const record = { ...makeOrder(), technicalDiagnosis: "Main defectuosa", budgetDetail: "Cambio de capacitores" };
    const { rerender } = render(<RepairAccessOrdersSection {...props} orders={[record]} search="main defectuosa" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
    rerender(<RepairAccessOrdersSection {...props} orders={[record]} search="cambio de capacitores" />);
    expect(screen.getByRole("article", { name: record.repairNumber })).toBeTruthy();
  });

  it.each([true, false])("mounts one desktop/mobile card list and no table by default (admin=%s)", (canManageIntake) => {
    const { container } = render(<RepairAccessOrdersSection {...props} canManageIntake={canManageIntake} />);
    const card = screen.getByRole("article", { name: orders[0].repairNumber });
    expect(card.parentElement?.className).toContain("md:grid-cols-2");
    expect(card.parentElement?.className).not.toContain("lg:hidden");
    expect(screen.queryByRole("table", { hidden: true })).toBeNull();
    expect(container.querySelectorAll("form[data-workshop-form]")).toHaveLength(1);
  });

  it("offers the admin table as an exclusive secondary presentation with all row actions", () => {
    const { container } = render(<RepairAccessOrdersSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver tabla" }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("article", { hidden: true })).toBeNull();
    expect(container.querySelectorAll("form[data-workshop-form]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Ficha completa" }));
    expect(props.onOpenDetail).toHaveBeenCalledWith(orders[0]);
    fireEvent.click(screen.getByText("Mas acciones"));
    fireEvent.click(screen.getByRole("button", { name: "Editar ingreso" }));
    expect(props.onEdit).toHaveBeenCalledWith(orders[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mas acciones" }));
    expect(screen.getByRole("button", { name: "Anular" }).closest("form")?.querySelector('input[name="id"]')?.getAttribute("value")).toBe(orders[0].id);
    expect(screen.getByRole("button", { name: "WhatsApp" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver tarjetas" }));
    expect(screen.queryByRole("table", { hidden: true })).toBeNull();
    expect(container.querySelectorAll("form[data-workshop-form]")).toHaveLength(1);
  });

  it("does not offer the table or new intake to technicians", () => {
    render(<RepairAccessOrdersSection {...props} canManageIntake={false} onNew={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ver tabla" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nueva orden" })).toBeNull();
  });

  it("keeps quick work available in the table without opening the complete record", () => {
    const record = { ...makeOrder(), workflow: { version: 3 }, repairProgress: "En revision" } as RepairAccessOrderRecord;
    render(<RepairAccessOrdersSection {...props} orders={[record]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver tabla" }));
    const quick = screen.getByText("Actualizar trabajo").closest("details")!;
    quick.open = true;
    fireEvent(quick, new Event("toggle"));
    const progress = screen.getByRole("textbox", { name: "Avance rapido" });
    fireEvent.change(progress, { target: { value: "Fuente reparada" } });
    quick.open = false;
    fireEvent(quick, new Event("toggle"));
    quick.open = true;
    fireEvent(quick, new Event("toggle"));
    expect((screen.getByRole("textbox", { name: "Avance rapido" }) as HTMLInputElement).value).toBe("Fuente reparada");
  });

  it("requires confirmation before cancelling from the table", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairAccessOrdersSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver tabla" }));
    fireEvent.click(screen.getByText("Mas acciones"));
    const form = screen.getByRole("button", { name: "Anular" }).closest("form")!;
    expect(fireEvent.submit(form)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockReturnValue(true);
    fireEvent.submit(form);
    expect(cancelRepairAccessOrderAction).toHaveBeenCalledOnce();
    expect(form.querySelector('input[name="id"]')?.getAttribute("value")).toBe(orders[0].id);
  });

  it("keeps the card editor mounted if leaving a dirty workspace is declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairAccessOrdersSection {...props} />);
    document.documentElement.setAttribute("data-unsaved-changes", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ver tabla" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("article", { name: orders[0].repairNumber })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("starts intake directly from the list toolbar", () => {
    const onNew = vi.fn();
    render(<RepairAccessOrdersSection {...props} onNew={onNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva orden" }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("keeps search and status stable while warranty is progressively disclosed", () => {
    render(<RepairAccessOrdersSection {...props} />);
    const search = screen.getByRole("textbox", { name: "Buscar orden de service" });
    const status = screen.getByRole("combobox", { name: "Filtrar ordenes por estado" });
    const advanced = screen.getByRole("combobox", { name: "Filtrar ordenes por garantia" }).closest("details");
    expect(advanced).not.toBeNull();
    expect(advanced?.open).toBe(false);
    fireEvent.click(screen.getByText("Filtros"));
    expect(advanced?.open).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar ordenes por garantia" }), { target: { value: "active" } });
    expect(props.onWarrantyFilterChange).toHaveBeenCalledWith("active");
    expect(screen.getByRole("textbox", { name: "Buscar orden de service" })).toBe(search);
    expect(screen.getByRole("combobox", { name: "Filtrar ordenes por estado" })).toBe(status);
    fireEvent.change(search, { target: { value: "REP-1" } });
    fireEvent.change(status, { target: { value: "presupuestado" } });
    expect(props.onSearchChange).toHaveBeenCalledWith("REP-1");
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("presupuestado");
  });

  it("shows an applied warranty filter without making users discover why orders are missing", () => {
    render(<RepairAccessOrdersSection {...props} warrantyFilter="active" />);
    expect((screen.getByRole("combobox", { name: "Filtrar ordenes por garantia" }) as HTMLSelectElement).value).toBe("active");
  });

  it("preserves local filtering and load-more without mounting duplicate lists", () => {
    const many = Array.from({ length: 40 }, (_, index) => makeOrder(index + 1));
    const { rerender } = render(<RepairAccessOrdersSection {...props} orders={many} />);
    expect(screen.getAllByRole("article")).toHaveLength(36);
    fireEvent.click(screen.getByRole("button", { name: "Cargar mas ordenes" }));
    expect(screen.getAllByRole("article")).toHaveLength(40);
    rerender(<RepairAccessOrdersSection {...props} orders={many} search="REP-000040" />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    rerender(<RepairAccessOrdersSection {...props} orders={many} statusFilter="presupuestado" />);
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getAllByText("No hay ordenes para esa busqueda o estado.")).toHaveLength(1);
  });
});
