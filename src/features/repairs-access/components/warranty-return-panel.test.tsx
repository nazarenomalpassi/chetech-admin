// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepairAccessOrderRecord } from "../queries";
import type { WarrantyReturnRecord } from "../warranty-return";
import { getOperationalDate } from "../warranty";
import { WarrantyReturnCase, WarrantyReturnPanel } from "./warranty-return-panel";

const mocks = vi.hoisted(() => ({ router: { refresh: vi.fn() }, start: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("../warranty-actions", () => ({ startWarrantyReturn: mocks.start, saveWarrantyReturn: mocks.save }));
Object.assign(globalThis, { React });
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

const record: WarrantyReturnRecord = {
  id: "20000000-0000-4000-8000-000000000001", orderId: "10000000-0000-4000-8000-000000000001",
  repairNumber: "REP-000513", customerName: "Cliente", deviceLabel: "TV Marca",
  receivedOn: "2026-10-19", issueReported: "Volvio a apagarse", accessories: "Control", conditionNotes: "Sin golpes",
  status: "en_revision", progress: "Revisando fuente", resolution: "", closedAt: null, recipient: null,
  version: 3, createdAt: "2026-10-19T12:00:00Z"
};
const order = {
  id: record.orderId, repairNumber: record.repairNumber, status: "retirado", warranty: { code: "expired" },
  workflow: { version: 8 }, warrantyReturns: []
} as unknown as RepairAccessOrderRecord;
function open(label: string) {
  const details = screen.getByText(label).closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}
function submit(label: string) { fireEvent.submit(screen.getByRole("button", { name: label }).closest("form")!); }
function expectExplicitLabels(container: HTMLElement) {
  for (const control of container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]), select, textarea')) {
    expect(control.id).toBeTruthy();
    expect(control.labels?.length).toBe(1);
    expect(control.labels?.[0].htmlFor).toBe(control.id);
    expect(control.labels?.[0].contains(control)).toBe(false);
  }
}

describe("warranty return intake", () => {
  it("explicitly labels all intake controls without including control values in label text", () => {
    const { container } = render(<WarrantyReturnPanel order={order} canManage />);
    open("Registrar reingreso por garantia");
    expectExplicitLabels(container);
  });
  it("warns about inactive coverage and submits only separate intake fields", async () => {
    mocks.start.mockResolvedValue({ success: false, message: "Conflicto" });
    const { container } = render(<WarrantyReturnPanel order={order} canManage />);
    open("Registrar reingreso por garantia");
    expect(screen.getByText(/no extiende ni renueva/i)).toBeTruthy();
    expect((screen.getByLabelText(/Autorizar recepcion/i) as HTMLInputElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText("Falla de este reingreso"), { target: { value: "Volvio a apagarse" } });
    fireEvent.click(screen.getByLabelText(/Autorizar recepcion/i));
    submit("Registrar reingreso");
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const data = mocks.start.mock.calls[0][1] as FormData;
    expect(data.get("id")).toBe(order.id);
    expect(data.get("version")).toBe("8");
    expect(data.get("operationId")).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.get("issueReported")).toBe("Volvio a apagarse");
    expect(data.get("acknowledgeCoverage")).toBe("on");
    expect(data.get("expectedVersion")).toBeNull();
    expect(container.querySelector('[name="repairAmount"], [name="budgetAmount"], [name="isPaid"]')).toBeNull();
  });

  it.each(["active", "expires_today"])("does not require acknowledgement for %s coverage", (code) => {
    render(<WarrantyReturnPanel order={{ ...order, warranty: { ...order.warranty, code } as RepairAccessOrderRecord["warranty"] }} canManage />);
    open("Registrar reingreso por garantia");
    expect((screen.getByLabelText(/Autorizar recepcion/i) as HTMLInputElement).required).toBe(false);
    expect(screen.getByText(/otra fecha/i)).toBeTruthy();
  });

  it("accepts a legacy delivered order and constrains intake to original delivery through today", () => {
    render(<WarrantyReturnPanel order={{ ...order, status: "reparado", deliveredAt: "2026-10-02T12:00:00Z" }} canManage />);
    open("Registrar reingreso por garantia");
    const received = screen.getByLabelText("Fecha de reingreso") as HTMLInputElement;
    expect(received.min).toBe("2026-10-02");
    expect(received.max).toBe(getOperationalDate());
  });

  it("preserves intake text when another date requires explicit coverage authorization", async () => {
    mocks.start.mockResolvedValueOnce({ success: false, message: "Autoriza la recepcion para esa fecha" }).mockResolvedValueOnce({ success: false, message: "Conflicto" });
    render(<WarrantyReturnPanel order={{ ...order, warranty: { ...order.warranty, code: "active" } }} canManage />);
    open("Registrar reingreso por garantia");
    fireEvent.change(screen.getByLabelText("Falla de este reingreso"), { target: { value: "Volvio a apagarse" } });
    fireEvent.change(screen.getByLabelText("Fecha de reingreso"), { target: { value: "2026-10-10" } });
    submit("Registrar reingreso");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("esa fecha"));
    expect((screen.getByLabelText("Falla de este reingreso") as HTMLTextAreaElement).value).toBe("Volvio a apagarse");
    fireEvent.click(screen.getByLabelText(/Autorizar recepcion/i));
    submit("Registrar reingreso");
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    expect(mocks.start.mock.calls[1][1].get("acknowledgeCoverage")).toBe("on");
    expect(mocks.start.mock.calls[1][1].get("receivedOn")).toBe("2026-10-10");
  });

  it("gives controls unique identities when multiple active cases are open", () => {
    const { container } = render(<><WarrantyReturnCase record={record} canManage /><WarrantyReturnCase record={{ ...record, id: "20000000-0000-4000-8000-000000000002" }} canManage /></>);
    for (const summary of screen.getAllByText("Actualizar reingreso")) {
      const details = summary.closest("details")!;
      details.open = true; fireEvent(details, new Event("toggle"));
    }
    const ids = Array.from(container.querySelectorAll("[id]")).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows the active issue and prevents a second intake", () => {
    render(<WarrantyReturnPanel order={{ ...order, warrantyReturns: [record] }} canManage />);
    expect(screen.getByText("Reingreso por garantia activo")).toBeTruthy();
    expect(screen.getByText(record.issueReported)).toBeTruthy();
    expect(screen.getByText("En revision")).toBeTruthy();
    expect(screen.queryByText("Registrar reingreso por garantia")).toBeNull();
  });

  it("allows another return after pickup while retaining the previous visit", () => {
    render(<WarrantyReturnPanel order={{ ...order, warrantyReturns: [{ ...record, status: "retirado", closedAt: record.createdAt, recipient: "Ana" }] }} canManage />);
    expect(screen.getByText("Registrar reingreso por garantia")).toBeTruthy();
    open("Historial de reingresos (1)");
    expect(screen.getByText(record.issueReported)).toBeTruthy();
    expect(screen.getByText(/Ana/)).toBeTruthy();
    expect(screen.queryByText("Actualizar reingreso")).toBeNull();
  });
});

describe("separate technical cycle", () => {
  it("collects a resolution and pickup in one submission from an in-progress return", async () => {
    mocks.save.mockResolvedValue({success:true,message:"Retiro registrado",recordVersion:4});
    render(<WarrantyReturnCase record={{...record,status:"en_reparacion"}} canManage />);
    open("Actualizar reingreso");
    fireEvent.change(screen.getByLabelText("Estado del reingreso"),{target:{value:"retirado"}});
    const resolution=screen.getByLabelText("Resolucion del reingreso") as HTMLTextAreaElement;
    expect(resolution.required).toBe(true);
    expect(screen.getByText(/resolucion y el retiro en un solo paso/i)).toBeTruthy();
    fireEvent.change(resolution,{target:{value:"Se reparo la retroiluminacion"}});
    fireEvent.change(screen.getByLabelText("Quien retira"),{target:{value:"Cliente"}});
    fireEvent.click(screen.getByLabelText(/Confirmo la devolucion/i));
    submit("Registrar retiro de garantia");
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
    const data=mocks.save.mock.calls[0][1] as FormData;
    expect(data.get("status")).toBe("retirado"); expect(data.get("resolution")).toBe("Se reparo la retroiluminacion");
    expect(data.get("recipient")).toBe("Cliente"); expect(data.get("confirmDelivery")).toBe("on");
  });
  it("keeps exact field labels separate from select options and saved textarea contents", () => {
    const { container } = render(<WarrantyReturnCase record={record} canManage />);
    open("Actualizar reingreso");
    expectExplicitLabels(container);
    expect(screen.getByLabelText("Estado del reingreso", { exact: true }).tagName).toBe("SELECT");
    fireEvent.change(screen.getByLabelText("Estado del reingreso"), { target: { value: "retirado" } });
    expectExplicitLabels(container);
  });
  it("lets technicians edit progress but not intake or delivery", () => {
    const { container } = render(<WarrantyReturnPanel order={{ ...order, warrantyReturns: [record] }} canManage={false} />);
    open("Actualizar reingreso");
    expect(screen.getByLabelText("Avance del reingreso")).toBeTruthy();
    expect(screen.getByRole("option", { name: "No presenta fallas" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Retirado" })).toBeNull();
    expect(container.querySelector('[name="recipient"], [name="confirmDelivery"], [name="repairAmount"]')).toBeNull();
    expect(screen.queryByText("Registrar reingreso por garantia")).toBeNull();
  });

  it("requires an explicit pickup confirmation and recipient only when returning the equipment", () => {
    render(<WarrantyReturnCase record={record} canManage />);
    open("Actualizar reingreso");
    expect(screen.queryByLabelText("Quien retira")).toBeNull();
    fireEvent.change(screen.getByLabelText("Estado del reingreso"), { target: { value: "retirado" } });
    expect((screen.getByLabelText("Quien retira") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/Confirmo la devolucion/i) as HTMLInputElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText("Estado del reingreso"), { target: { value: "no_presenta_fallas" } });
    expect(screen.queryByLabelText("Quien retira")).toBeNull();
  });

  it("preserves the draft and its starting version after a conflict and remote refresh", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "Cambio en otro dispositivo" });
    const { rerender } = render(<WarrantyReturnCase record={record} canManage />);
    open("Actualizar reingreso");
    fireEvent.change(screen.getByLabelText("Avance del reingreso"), { target: { value: "Mi revision" } });
    rerender(<WarrantyReturnCase record={{ ...record, version: 4, progress: "Otro avance" }} canManage />);
    submit("Guardar reingreso");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("otro dispositivo"));
    expect((screen.getByLabelText("Avance del reingreso") as HTMLTextAreaElement).value).toBe("Mi revision");
    expect(mocks.save.mock.calls[0][1].get("version")).toBe("3");
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("retries uncertain saves with the same operation and no lost text", async () => {
    mocks.save.mockRejectedValue(new Error("network"));
    render(<WarrantyReturnCase record={record} canManage />);
    open("Actualizar reingreso");
    fireEvent.change(screen.getByLabelText("Avance del reingreso"), { target: { value: "Fuente revisada" } });
    submit("Guardar reingreso");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const first = mocks.save.mock.calls[0][1].get("operationId");
    submit("Guardar reingreso");
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].get("operationId")).toBe(first);
    expect((screen.getByLabelText("Avance del reingreso") as HTMLTextAreaElement).value).toBe("Fuente revisada");
  });

  it("blocks repeat saves after success until the case version catches up", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado", recordVersion: 6 });
    const { rerender } = render(<WarrantyReturnCase record={record} canManage />);
    open("Actualizar reingreso");
    fireEvent.change(screen.getByLabelText("Avance del reingreso"), { target: { value: "Fuente revisada" } });
    submit("Guardar reingreso");
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Guardar reingreso" }).closest("fieldset")?.disabled).toBe(true);
    submit("Guardar reingreso");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    rerender(<WarrantyReturnCase record={{ ...record, version: 5 }} canManage />);
    expect(screen.getByRole("button", { name: "Guardar reingreso" }).closest("fieldset")?.disabled).toBe(true);
    rerender(<WarrantyReturnCase record={{ ...record, version: 6, progress: "Fuente revisada" }} canManage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar reingreso" }).closest("fieldset")?.disabled).toBe(false));
  });
});
