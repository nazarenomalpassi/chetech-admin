// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutsourcingOperations } from "./outsourcing-operations";
import type { RepairOutsourcingRecord } from "../queries";
Object.assign(globalThis, { React });
vi.mock("@/features/outsourcings/actions", () => ({ markRepairOutsourcingRetrievedAction: vi.fn(), recordRepairOutsourcingQualityAction: vi.fn(), updateRepairOutsourcingFollowupAction: vi.fn() }));
afterEach(cleanup);
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
});
