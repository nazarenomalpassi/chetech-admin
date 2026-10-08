// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReconciliationAmendmentDialog } from "./reconciliation-amendment-dialog";
Object.assign(globalThis, { React });
const mocks = vi.hoisted(() => ({ reopen: vi.fn(), correct: vi.fn() }));
vi.mock("./reconciliation-actions", () => ({ reopenCashReconciliationAction: mocks.reopen, closeCashReconciliationCorrectionAction: mocks.correct }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
const accounts = [{ method: "efectivo" as const, expected: 100, physical: 90, difference: -10, reason: "Faltante" }, { method: "nx" as const, expected: 20, physical: 20, difference: 0, reason: "" }, { method: "mp" as const, expected: 30, physical: 30, difference: 0, reason: "" }];
const record = { id: "root", business_date: "2026-09-01", accounts, observations: "", created_by: "actor", created_at: "2026-09-01T12:00:00Z" };
describe("cash correction UI", () => {
  it.each(["Cancelar", "Escape"])("protects changed correction fields on %s without prompting for unchanged values", (close) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ReconciliationAmendmentDialog record={record} onRecorded={vi.fn(async () => {})} />);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir con motivo" }));
    const closeDialog = () => close === "Escape"
      ? fireEvent.keyDown(document, { key: "Escape" })
      : fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "Reconteo" } });
    closeDialog();
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "" } });
    closeDialog();
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("submits corrected physical counts against the original expected snapshot", async () => {
    mocks.correct.mockResolvedValue({ success: true, message: "Corregido" });
    render(<ReconciliationAmendmentDialog record={{ ...record, amendments: [{ id: "reopen", root_id: "root", supersedes_id: null, kind: "reopened", reason: "Reconteo", accounts, observations: "", created_by: "actor", created_at: record.created_at }] }} onRecorded={vi.fn(async () => {})} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir conteo y volver a cerrar" }));
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "Monedas recontadas" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "95" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(mocks.correct).toHaveBeenCalledWith(expect.objectContaining({ expectedHeadId: "reopen",
      accounts: expect.arrayContaining([expect.objectContaining({ method: "efectivo", expected: 100, physical: 95 })]) })));
  });
  it("requires a reopening reason and references the existing closed snapshot", async () => {
    mocks.reopen.mockResolvedValue({ success: true, message: "Reabierto" });
    const onRecorded = vi.fn(async () => {});
    render(<ReconciliationAmendmentDialog record={record} onRecorded={onRecorded} />);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir con motivo" }));
    expect((screen.getByLabelText("Motivo obligatorio") as HTMLTextAreaElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "Reconteo verificado" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(mocks.reopen).toHaveBeenCalledWith(expect.objectContaining({ rootId: "root", expectedHeadId: "root", reason: "Reconteo verificado" })));
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });
});
