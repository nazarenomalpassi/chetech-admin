// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutsourcingOperations } from "./outsourcing-operations";
import type { RepairOutsourcingRecord } from "../queries";
Object.assign(globalThis, { React });
vi.mock("@/features/outsourcings/actions", () => ({ markRepairOutsourcingRetrievedAction: vi.fn(), recordRepairOutsourcingQualityAction: vi.fn(), updateRepairOutsourcingFollowupAction: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const record = { id: "1", status: "en_taller", updatedAt: "2026-10-05T10:00:00Z", responsibleName: "Juan", promisedAt: "2026-10-04", sentAt: "2026-10-01", expectedCost: 100, actualCost: null, qualityStatus: "pendiente", qualityNotes: "", overdue: true, order: { repairNumber: "REP-000266" } } as RepairOutsourcingRecord;
describe("outsourcing return and consultation UI", () => {
  it("opens a complete return form without inventing actual cost from the quote", () => {
    render(<OutsourcingOperations record={record} />);
    expect(screen.getByText(/Vencida: consultar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registrar retorno" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("spinbutton", { name: /Costo final/ }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("combobox", { name: "Resultado del control" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Pruebas y observaciones" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("supports recording quality after the team has received the equipment", () => {
    render(<OutsourcingOperations record={{ ...record, status: "retirado", overdue: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar control" }));
    expect((screen.getByRole("textbox", { name: "Pruebas y observaciones" }) as HTMLTextAreaElement).required).toBe(true);
    expect(screen.queryByRole("button", { name: "Registrar retorno" })).toBeNull();
  });
  it.each(["cancel", "close", "escape"])("protects an edited follow-up when closing with %s", (method) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OutsourcingOperations record={record} />);
    fireEvent.click(screen.getByRole("button", { name: "Seguimiento" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Responsable" }), { target: { value: "Otra persona" } });
    if (method === "escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: method === "cancel" ? "Cancelar" : "Cerrar seguimiento" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Responsable" }) as HTMLInputElement).value).toBe("Otra persona");
    confirm.mockReturnValue(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("closes without confirmation when a field is restored to its original value", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<OutsourcingOperations record={record} />);
    fireEvent.click(screen.getByRole("button", { name: "Seguimiento" }));
    const responsible = screen.getByRole("textbox", { name: "Responsable" });
    fireEvent.change(responsible, { target: { value: "Otro" } });
    fireEvent.change(responsible, { target: { value: "Juan" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
