// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepairAccessOrdersSection } from "./repair-access-orders-section";
import type { RepairAccessOrderRecord } from "../queries";

Object.assign(globalThis, { React });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.removeAttribute("data-unsaved-changes"); });
vi.mock("../actions", () => ({ cancelRepairAccessOrderAction: vi.fn() }));
vi.mock("./repair-access-workshop-card", () => ({
  RepairAccessWorkshopCard: ({ order, canManageIntake, onOpenDetail }: { order: RepairAccessOrderRecord; canManageIntake: boolean; onOpenDetail: (order: RepairAccessOrderRecord) => void }) =>
    <article aria-label={order.repairNumber}><form data-workshop-form><input aria-label={`Avance ${order.repairNumber}`} /></form>{canManageIntake ? <button onClick={() => onOpenDetail(order)}>Ficha {order.repairNumber}</button> : null}</article>
}));
vi.mock("./repair-access-whatsapp-actions", () => ({ RepairAccessWhatsAppButton: () => <button>WhatsApp</button> }));

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

describe("order workspace list", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(props.onOpenDetail).toHaveBeenCalledWith(orders[0]);
    fireEvent.click(screen.getByRole("button", { name: "Editar ingreso" }));
    expect(props.onEdit).toHaveBeenCalledWith(orders[0]);
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
