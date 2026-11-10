// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./order-coordination-panel", () => ({ CoordinationDialog: ({ title, children }: any) => <section role="dialog" aria-label={title}>{children}</section>, DialogField: ({ label, children }: any) => <label>{label}{children}</label>, PartManagementDialog: () => <div>Gestion de stock existente</div> }));
vi.mock("../supplier-claim-actions", () => ({ saveSupplierClaim: vi.fn() }));
import { WorkshopPartsWorkspace } from "./workshop-parts-workspace";
Object.assign(globalThis, { React });
afterEach(cleanup);
const part: any = { id: "p", orderId: "o", description: "Fuente", quantity: 3, receivedQuantity: 1, installedQuantity: 0, claimedQuantity: 0, status: "ordered", priority: "alta", supplier: "Proveedor", expectedDate: null, unitCost: null, version: 1, repairNumber: "REP-000521", customerName: "Cliente", warrantyReturnId: "w" };
const page: any = { items: [part], total: 51, page: 1, pageSize: 50, counts: { requested: 20, ordered: 31, available: 1, overdue: 0, claims: 0 } };
const claims: any = { items: [], total: 0, page: 1, pageSize: 50 };
describe("bandeja de repuestos y reclamos", () => {
  it("identifica recepciones parciales, costos desconocidos y siguiente pagina", () => {
    render(<WorkshopPartsWorkspace data={page} claims={claims} canManage />);
    expect(screen.getByText("Recepcion parcial")).toBeTruthy();
    expect(screen.getByText("1 de 3 recibidos · 0 usados")).toBeTruthy();
    expect(screen.getByText("Sin informar")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Siguiente pagina de repuestos" }).getAttribute("href")).toContain("pp=2");
    expect(screen.getByRole("link", { name: "REP-000521" }).getAttribute("href")).toContain("view=detalle");
  });
  it("reclama el repuesto recibido y puede vincular al reingreso sin pedir nueva orden", () => {
    render(<WorkshopPartsWorkspace data={page} claims={claims} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Reclamar al proveedor" }));
    expect(screen.getByRole("dialog", { name: "Reclamar repuesto al proveedor" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Vincular al reingreso/ })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Cantidad defectuosa" }).getAttribute("max")).toBe("1");
  });
  it("no ofrece uso ni otro reclamo cuando ya esta retenido por reclamo", () => {
    render(<WorkshopPartsWorkspace data={{ ...page, items: [{ ...part, claimedQuantity: 1 }] }} claims={claims} canManage />);
    expect(screen.queryByRole("button", { name: "Reclamar al proveedor" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Gestionar repuesto" })).toBeNull();
    expect(screen.getByText(/Resolver reclamo antes de usar/)).toBeTruthy();
  });
  it("oculta compras y datos financieros para la vista de taller", () => {
    render(<WorkshopPartsWorkspace data={page} claims={null} canManage={false} />);
    expect(screen.queryByText("Proveedor")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reclamar al proveedor" })).toBeNull();
    expect(screen.queryByText("Costo por unidad")).toBeNull();
    expect(screen.getByRole("button", { name: "Registrar uso" })).toBeTruthy();
  });
});
