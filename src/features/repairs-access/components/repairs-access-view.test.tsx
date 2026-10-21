// @vitest-environment jsdom
import React, { type Ref } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import type { RepairAccessOrderRecord, RepairAccessSummary } from "@/features/repairs-access/queries";
import type { WorkshopPageInfo } from "@/features/repairs-access/page-queries";

Object.assign(globalThis, { React });
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const wizardEditing = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/reparaciones-access"); window.localStorage.clear(); });
vi.mock("@/features/repairs-access/actions", () => ({ saveRepairAccessOrderAction: vi.fn() }));
vi.mock("@/features/repairs-access/components/repair-access-command-center", () => ({
  RepairAccessCommandCenter: ({ onOpenStatus }: { onOpenStatus: (status: string) => void }) => <button onClick={() => onOpenStatus("presupuestado")}>Ver presupuestadas</button>
}));
vi.mock("@/features/repairs-access/components/repair-access-orders-section", () => ({
  RepairAccessOrdersSection: ({ headingRef, search, statusFilter, warrantyFilter, onSearchChange, onEdit, onOpenDetail, onNew, orders }: {
    headingRef: Ref<HTMLHeadingElement>; search: string; statusFilter: string; warrantyFilter: string;
    onSearchChange: (value: string) => void; onEdit: (order: RepairAccessOrderRecord) => void;
    onOpenDetail: (order: RepairAccessOrderRecord) => void; onNew?: () => void; orders: RepairAccessOrderRecord[];
  }) => <section><h2 ref={headingRef} tabIndex={-1}>Mesa de trabajo</h2><input aria-label="Orden buscada" onChange={(e) => onSearchChange(e.target.value)} value={search} /><p>{statusFilter}</p><p>{warrantyFilter}</p>
    {onNew ? <button onClick={onNew}>Crear desde listado</button> : null}
    {orders.map((order) => <div key={order.id}><button onClick={() => onEdit(order)}>Editar {order.repairNumber}</button><button onClick={() => onOpenDetail(order)}>Ficha {order.repairNumber}</button></div>)}
  </section>
}));
vi.mock("@/features/repairs-access/components/repair-access-new-order-wizard", () => ({
  RepairAccessNewOrderWizard: ({ editing, onCancel, onDirtyChange }: { editing: RepairAccessOrderRecord | null; onCancel: () => void; onDirtyChange: (dirty: boolean) => void }) => {
    wizardEditing(editing);
    return <section><h2>{editing ? `Ingreso ${editing.repairNumber}` : "Ingreso nuevo"}</h2><button onClick={onCancel}>Cancelar ingreso</button><button onClick={() => onDirtyChange(true)}>Cambiar ingreso</button></section>;
  }
}));
vi.mock("@/features/repairs-access/components/repair-access-order-detail", () => ({
  RepairAccessOrderDetail: ({ order, onBack }: { order: RepairAccessOrderRecord; onBack: () => void }) => <section><h2>Detalle {order.repairNumber}</h2><button onClick={onBack}>Volver a ordenes</button></section>
}));
vi.mock("@/features/repairs-access/components/repair-access-customers-section", () => ({ RepairAccessCustomersSection: () => <h2>Listado de clientes</h2> }));
vi.mock("@/features/repairs-access/components/workshop-updates", () => ({ WorkshopUpdates: () => null }));

const props = {
  orders: [], customers: [], latestImport: null, summary: {} as RepairAccessSummary,
  message: null, canManageIntake: true, defaultWarrantyDays: 90
};
const order = { id: "repair-1", repairNumber: "REP-000357", customer: { phone: "3571573744", alternatePhone: "" } } as RepairAccessOrderRecord;
const pageInfo: WorkshopPageInfo = { total: 1, pageSize: 30, cursor: "", nextCursor: null, search: "", status: "todos", warranty: "todos", scope: "all" };

describe("workshop section navigation", () => {
  it("offers the newly saved order's receipt beside success while retaining the default listing", () => {
    const other = { ...order, id: "other-order", repairNumber: "REP-999999" };
    const { container } = render(<RepairsAccessView {...props} orders={[other, order]} initialOrderId={order.id} actionStatus="repair_access_created" message={{ success: true, message: "Orden creada" }} />);
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: `Ingreso guardado: ${order.repairNumber}` })).toBeTruthy();
    const send = screen.getByRole("button", { name: "Enviar comprobante de ingreso" });
    expect(new FormData(send.closest("form")!).get("orderId")).toBe(order.id);
    expect(send.closest("details")).toBeNull();
    expect(screen.getByText("Orden creada").compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(send.compareDocumentPosition(container.querySelector("nav")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    { canManageIntake: false, actionStatus: "repair_access_created", initialOrderId: order.id, success: true },
    { canManageIntake: true, actionStatus: "repair_access_intake_updated", initialOrderId: order.id, success: true },
    { canManageIntake: true, actionStatus: "repair_access_created", initialOrderId: "missing", success: true },
    { canManageIntake: true, actionStatus: "repair_access_created", initialOrderId: order.id, success: false }
  ])("does not attach receipt confirmation to an unrelated or unauthorized save: %j", ({ success, ...input }) => {
    render(<RepairsAccessView {...props} {...input} orders={[order]} message={{ success, message: "Resultado" }} />);
    expect(screen.queryByRole("button", { name: "Enviar comprobante de ingreso" })).toBeNull();
  });

  it("keeps the successful save screen operational when local draft removal is blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    expect(() => render(<RepairsAccessView {...props} actionStatus="repair_access_created" />)).not.toThrow();
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
  });

  it("honors an explicit query-card link after local typing instead of resurrecting the old search", () => {
    const summary = { statusCounts: {} } as RepairAccessSummary;
    const { rerender } = render(<RepairsAccessView {...props} summary={summary} pageInfo={pageInfo} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Orden buscada" }), { target: { value: "Belén" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultas" }));
    const card = screen.getByText("Pendientes de revision").parentElement!;
    const link = within(card).getByRole("link");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    rerender(<RepairsAccessView {...props} summary={summary} initialView="ordenes" pageInfo={{ ...pageInfo, status: "pendiente_revision" }} />);
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("pendiente_revision")).toBeTruthy();
  });

  it("restores explicit same-route sidebar filters but ignores modified clicks and canceled navigation", () => {
    render(<RepairsAccessView {...props} pageInfo={pageInfo} />);
    const input = screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Belén" } });
    const anchor = document.createElement("a");
    anchor.href = "/reparaciones-access?view=ordenes&state=en_revision";
    anchor.addEventListener("click", (event) => event.preventDefault());
    document.body.append(anchor);
    fireEvent.click(anchor, { ctrlKey: true });
    expect(input.value).toBe("Belén");
    const cancel = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
    document.addEventListener("click", cancel, { capture: true, once: true });
    fireEvent.click(anchor);
    expect(input.value).toBe("Belén");
    fireEvent.click(anchor);
    expect(input.value).toBe("");
    expect(screen.getByText("en_revision")).toBeTruthy();
    anchor.remove();
  });

  it("does not replace a newer accented draft with an older server search response", () => {
    const { rerender } = render(<RepairsAccessView {...props} pageInfo={pageInfo} />);
    const input = screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bel" } });
    fireEvent.change(input, { target: { value: "Belén " } });
    rerender(<RepairsAccessView {...props} pageInfo={{ ...pageInfo, search: "Bel" }} />);
    expect(input.value).toBe("Belén ");
    fireEvent.change(input, { target: { value: "Belén Pérez" } });
    rerender(<RepairsAccessView {...props} pageInfo={{ ...pageInfo, search: "Belén " }} />);
    expect(input.value).toBe("Belén Pérez");
  });

  it("does not resurrect a cleared query when the previous request completes", () => {
    const { rerender } = render(<RepairsAccessView {...props} pageInfo={pageInfo} />);
    const input = screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "357" } });
    fireEvent.change(input, { target: { value: "" } });
    rerender(<RepairsAccessView {...props} pageInfo={{ ...pageInfo, search: "357" }} />);
    expect(input.value).toBe("");
  });

  it("shows the newly saved REP instead of retaining the search used before opening reception", () => {
    const { rerender } = render(<RepairsAccessView {...props} pageInfo={pageInfo} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Orden buscada" }), { target: { value: "Belén" } });
    fireEvent.click(screen.getByRole("button", { name: "Nueva orden" }));
    rerender(<RepairsAccessView {...props} pageInfo={pageInfo} initialOrderId={order.id} actionStatus="repair_access_created" orders={[order]} />);
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe(order.repairNumber);
  });

  it("honors Back/Forward filter intent without letting a late response overwrite it", () => {
    const { rerender } = render(<RepairsAccessView {...props} pageInfo={pageInfo} />);
    const input = screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Belén Pérez" } });
    window.history.replaceState(null, "", "/reparaciones-access?view=ordenes&q=Carlos&state=en_revision&warranty=active");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(input.value).toBe("Carlos");
    expect(screen.getByText("en_revision")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    rerender(<RepairsAccessView {...props} pageInfo={{ ...pageInfo, search: "Bel" }} />);
    expect(input.value).toBe("Carlos");
  });

  it("defaults the shared administrator to orders without stealing initial focus", () => {
    render(<RepairsAccessView {...props} />);
    const heading = screen.getByRole("heading", { name: "Mesa de trabajo" });
    expect(document.activeElement).not.toBe(heading);
    expect(screen.queryByRole("button", { name: "Ver presupuestadas" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ordenes" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps warranty returns in primary navigation and secondary tools in an accessible disclosure", () => {
    render(<RepairsAccessView {...props} />);
    const nav = screen.getByRole("navigation", { name: "Secciones de reparaciones" });
    const more = within(nav).getByText("Mas opciones").closest("details");
    expect(more).not.toBeNull();
    expect(more?.open).toBe(false);
    // jsdom does not remove closed details contents from the accessibility tree.
    expect(within(nav).getAllByRole("button").filter((button) => !button.closest("details")).map((button) => button.textContent)).toEqual(["Ordenes", "Garantias (0)", "Nueva orden", "Clientes"]);
    fireEvent.click(within(nav).getByText("Mas opciones"));
    expect(more?.open).toBe(true);
    expect(within(nav).getByRole("button", { name: "Resumen" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Consultas" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Importar" })).toBeTruthy();
  });

  it("lets technicians open warranty returns without exposing intake tools", () => {
    render(<RepairsAccessView {...props} canManageIntake={false} />);
    const nav = screen.getByRole("navigation", { name: "Secciones de reparaciones" });
    expect(within(nav).queryByRole("button", { name: "Nueva orden" })).toBeNull();
    fireEvent.click(within(nav).getByRole("button", { name: "Garantias (0)" }));
    expect(screen.getByRole("heading", { name: "Reingresos por garantia" })).toBeTruthy();
    expect(router.push.mock.calls.at(-1)?.[0]).toContain("view=garantias");
  });

  it("honors the technician warranty deep link and the global active count", () => {
    render(<RepairsAccessView {...props} canManageIntake={false} initialView="garantias" warrantyReturnsCount={7} />);
    expect(screen.getByRole("button", { name: "Garantias (7)" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Reingresos por garantia" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mesa de trabajo" })).toBeNull();
  });

  it.each(["retirado", "no_presenta_fallas"])("preserves explicit administrator intake corrections after pickup (%s)", (status) => {
    render(<RepairsAccessView {...props} initialView="nueva" initialOrderId={order.id} orders={[{ ...order, status, deliveredAt: "2026-10-01T12:00:00Z" }]} />);
    expect(screen.getByRole("heading", { name: `Ingreso ${order.repairNumber}` })).toBeTruthy();
  });

  it("preserves the existing delivered intake correction path", () => {
    render(<RepairsAccessView {...props} orders={[{ ...order, deliveredAt: "2026-10-01T12:00:00Z" }]} />);
    fireEvent.click(screen.getByRole("button", { name: `Editar ${order.repairNumber}` }));
    expect(screen.getByRole("heading", { name: `Ingreso ${order.repairNumber}` })).toBeTruthy();
  });

  it.each(["panel", "importar"])("retains the explicit %s route even with an order parameter", (initialView) => {
    render(<RepairsAccessView {...props} initialView={initialView} initialOrderId={order.id} orders={[order]} />);
    expect(initialView === "panel" ? screen.getByRole("button", { name: "Ver presupuestadas" }) : screen.getByRole("heading", { name: "Trazabilidad del Excel" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: `Detalle ${order.repairNumber}` })).toBeNull();
  });

  it.each(["panel", "importar", "detalle"])("honors explicit %s even when an old intake success remains in the URL", (initialView) => {
    render(<RepairsAccessView {...props} initialView={initialView} actionStatus="repair_access_created" initialOrderId={order.id} orders={[order]} />);
    expect(initialView === "panel" ? screen.getByRole("button", { name: "Ver presupuestadas" }) : screen.getByRole("heading", { name: initialView === "detalle" ? `Detalle ${order.repairNumber}` : "Trazabilidad del Excel" })).toBeTruthy();
  });

  it("moves keyboard focus to the order heading after a status drilldown", () => {
    render(<RepairsAccessView {...props} initialView="panel" />);
    const shortcut = screen.getByRole("button", { name: "Ver presupuestadas" });
    shortcut.focus();
    fireEvent.click(shortcut);
    expect(screen.getByText("presupuestado")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Mesa de trabajo" }));
  });
  it.each([true, false])("opens a quick workspace deep link with REP searched (admin=%s)", (canManageIntake) => {
    render(<RepairsAccessView {...props} pageInfo={pageInfo} canManageIntake={canManageIntake} initialOrderId={order.id} orders={[order]} />);
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe("REP-000357");
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: "Mesa de trabajo" }));
  });

  it("preserves initial search, status and warranty instead of overwriting them with the deep link", () => {
    render(<RepairsAccessView {...props} pageInfo={{ ...pageInfo, search: "telefono", status: "presupuestado", warranty: "active" }} initialOrderId={order.id} orders={[order]} />);
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe("telefono");
    expect(screen.getByText("presupuestado")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
  });

  it("opens full detail only when explicitly requested and keeps it current on refresh", () => {
    const { rerender } = render(<RepairsAccessView {...props} initialView="detalle" initialOrderId={order.id} orders={[order]} />);
    expect(screen.getByRole("heading", { name: `Detalle ${order.repairNumber}` })).toBeTruthy();
    const updated = { ...order, repairNumber: "REP-000358" };
    rerender(<RepairsAccessView {...props} initialView="detalle" initialOrderId={order.id} orders={[updated]} />);
    expect(screen.getByRole("heading", { name: `Detalle ${updated.repairNumber}` })).toBeTruthy();
  });

  it("returns from detail to orders and stays there when order data refreshes", () => {
    const { rerender } = render(<RepairsAccessView {...props} initialView="detalle" initialOrderId={order.id} orders={[order]} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver a ordenes" }));
    rerender(<RepairsAccessView {...props} initialView="detalle" initialOrderId={order.id} orders={[{ ...order }]} />);
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Mesa de trabajo" }));
  });

  it("keeps the quick workspace and local search when saving refreshes the same deep-linked order", () => {
    const { rerender } = render(<RepairsAccessView {...props} pageInfo={pageInfo} initialOrderId={order.id} orders={[order]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Orden buscada" }), { target: { value: "pantalla" } });
    rerender(<RepairsAccessView {...props} pageInfo={{ ...pageInfo }} initialOrderId={order.id} orders={[{ ...order }]} />);
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe("pantalla");
    expect(screen.queryByRole("heading", { name: `Detalle ${order.repairNumber}` })).toBeNull();
  });

  it("opens detail from the list callback and writes an explicit detail URL", () => {
    render(<RepairsAccessView {...props} initialView="ordenes" orders={[order]} />);
    fireEvent.click(screen.getByRole("button", { name: `Ficha ${order.repairNumber}` }));
    expect(screen.getByRole("heading", { name: `Detalle ${order.repairNumber}` })).toBeTruthy();
    const params = new URL(router.push.mock.calls.at(-1)![0], window.location.origin).searchParams;
    expect(params.get("view")).toBe("detalle");
    expect(params.get("order")).toBe(order.id);
  });

  it.each([false, true])("canceling intake returns to orders instead of an empty form (editing=%s)", (editing) => {
    render(<RepairsAccessView {...props} initialView="ordenes" orders={[order]} />);
    fireEvent.click(screen.getByRole("button", { name: editing ? `Editar ${order.repairNumber}` : "Nueva orden" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ingreso" }));
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ingreso nuevo" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Mesa de trabajo" }));
  });

  it("honors the unsaved intake guard before canceling", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairsAccessView {...props} initialView="nueva" />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar ingreso" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ingreso" }));
    expect(screen.getByRole("heading", { name: "Ingreso nuevo" })).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ingreso" }));
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
  });

  it("does not clear the dirty guard when the already active new-order tab is pressed", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepairsAccessView {...props} initialView="nueva" />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar ingreso" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva orden" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ingreso" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Ingreso nuevo" })).toBeTruthy();
  });

  it("does not reset a dirty edit when the server acknowledges its navigation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { rerender } = render(<RepairsAccessView {...props} initialView="ordenes" orders={[order]} />);
    fireEvent.click(screen.getByRole("button", { name: `Editar ${order.repairNumber}` }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar ingreso" }));
    rerender(<RepairsAccessView {...props} initialView="nueva" initialOrderId={order.id} orders={[{ ...order }]} />);
    expect(wizardEditing.mock.calls.at(-1)![0]).toBe(order);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ingreso" }));
    expect(screen.getByRole("heading", { name: `Ingreso ${order.repairNumber}` })).toBeTruthy();
  });

  it("does not replace intake values on a realtime data refresh while editing", () => {
    const { rerender } = render(<RepairsAccessView {...props} initialView="nueva" initialOrderId={order.id} orders={[order]} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar ingreso" }));
    rerender(<RepairsAccessView {...props} initialView="nueva" initialOrderId={order.id} orders={[{ ...order }]} />);
    expect(wizardEditing.mock.calls.at(-1)![0]).toBe(order);
  });

  it("integrates the list's direct new-order callback", () => {
    render(<RepairsAccessView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear desde listado" }));
    expect(screen.getByRole("heading", { name: "Ingreso nuevo" })).toBeTruthy();
  });

  it.each(["repair_access_created", "repair_access_intake_updated"])("returns %s to the quick workspace, not detail or intake", (actionStatus) => {
    render(<RepairsAccessView {...props} initialView="nueva" initialOrderId={order.id} actionStatus={actionStatus} orders={[order]} />);
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe(order.repairNumber);
  });

  it("retains a failed editing intake rather than opening a blank new form", () => {
    render(<RepairsAccessView {...props} initialView="nueva" initialOrderId={order.id} orders={[order]} message={{ success: false, message: "No se pudo guardar" }} />);
    expect(screen.getByRole("heading", { name: `Ingreso ${order.repairNumber}` })).toBeTruthy();
  });

  it("preserves the order URL filters when returning from canceled intake", () => {
    window.history.replaceState(null, "", "/reparaciones-access?view=nueva&q=telefono&state=presupuestado&warranty=active&scope=parts&cursor=page2&custom=keep");
    render(<RepairsAccessView {...props} initialView="nueva" pageInfo={{ ...pageInfo, search: "telefono", status: "presupuestado", warranty: "active", scope: "parts", cursor: "page2" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ingreso" }));
    const params = new URL(router.push.mock.calls.at(-1)![0], window.location.origin).searchParams;
    expect(Object.fromEntries(params)).toEqual({ view: "ordenes", q: "telefono", state: "presupuestado", warranty: "active", scope: "parts", cursor: "page2", custom: "keep" });
  });

  it("commits pending search to the URL before opening intake", () => {
    window.history.replaceState(null, "", "/reparaciones-access?view=ordenes&q=telefono&scope=parts&cursor=page2");
    render(<RepairsAccessView {...props} initialView="ordenes" pageInfo={{ ...pageInfo, search: "telefono", scope: "parts", cursor: "page2" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Orden buscada" }), { target: { value: "pantalla" } });
    fireEvent.click(screen.getByRole("button", { name: "Nueva orden" }));
    const params = new URL(router.push.mock.calls.at(-1)![0], window.location.origin).searchParams;
    expect(params.get("q")).toBe("pantalla");
    expect(params.get("scope")).toBe("parts");
    expect(params.get("cursor")).toBeNull();
  });

  it.each(["detalle", "panel", "importar", "nueva", "clientes"])("does not grant technician access to %s", (initialView) => {
    render(<RepairsAccessView {...props} canManageIntake={false} initialView={initialView} initialOrderId={order.id} orders={[order]} />);
    expect(screen.getByRole("heading", { name: "Mesa de trabajo" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Secciones de reparaciones" });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["Ordenes", "Garantias (0)"]);
    expect(screen.queryByRole("button", { name: "Crear desde listado" })).toBeNull();
  });
});
