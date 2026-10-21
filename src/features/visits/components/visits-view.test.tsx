// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisitsView } from "./visits-view";
import type { VisitRecord } from "../model";
import { serializeVisitNotes } from "../schemas";
Object.assign(globalThis, { React });
vi.mock("@/features/visits/actions", () => ({ saveVisitAction: vi.fn(), updateVisitStatusAction: vi.fn(), deleteVisitAction: vi.fn() }));
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
const visit: VisitRecord = { id: "visit", customerName: "Juan", customerPhone: "341", address: "San Martin 123", visitDate: "2026-10-05", timeFrom: "09:00", timeTo: "10:00", reason: "Revisar TV", notes: "  Tocar timbre\nNo retirar sin aviso  ", status: "confirmada", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-04T10:00:00Z", technicianId: "tech", repairAccessOrderId: "repair", repairNumber: "REP-000266" };
const data = { migrationReady: true, today: "2026-10-05", technicians: [{ id: "tech", full_name: "Tecnico anterior" }], filters: { search: "cliente", status: "confirmada", date: "2026-10-05", view: "week", technicianId: "" }, visits: [] as VisitRecord[], summary: { todayCount: 0, pendingTodayCount: 0, openCount: 0, upcomingCount: 0, nextVisit: null } };

describe("one visit workflow", () => {
  it("shows plain observations and a separate read-only checklist to technicians", () => {
    render(<VisitsView canManage={false} canUpdate canDelete={false} data={{ ...data, visits: [{ ...visit, notes: serializeVisitNotes({ notes: "Tocar timbre", toolsRequired: "yes", toolsDetail: "Escalera y tester" }) }] }} message={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Actualizar visita" })[0]);
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByLabelText("Observaciones") as HTMLTextAreaElement).value).toBe("Tocar timbre");
    expect(within(dialog).getByText(/Escalera y tester/)).toBeTruthy();
    expect(dialog.querySelector('[name="toolsRequired"]')).toBeNull();
  });
  it("does not expose mutations to a read-only viewer", () => {
    render(<VisitsView canManage={false} canDelete={false} data={{ ...data, visits: [visit] }} message={null} />);
    expect(screen.queryByRole("button", { name: /Editar|Actualizar|Nueva visita|Cambiar estado|Mas acciones/ })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Estado de Juan" })).toBeNull();
  });
  it("keeps administrative cancellation behind More actions and confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<VisitsView canManage canDelete data={{ ...data, visits: [visit] }} message={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mas acciones" })[0]);
    const cancel = screen.getByRole("button", { name: "Cancelar y conservar" });
    const event = new Event("submit", { bubbles: true, cancelable: true });
    cancel.closest("form")!.dispatchEvent(event);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/conservar/i));
    expect(event.defaultPrevented).toBe(true);
    confirm.mockRestore();
  });
  it("starts with the list and one primary new-visit entry, with no assignment controls", () => {
    render(<VisitsView canManage canDelete data={data} message={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Nombre del cliente" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /tecnico/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nueva visita" }));
    const dialog = screen.getByRole("dialog", { name: "Nueva visita" });
    expect(within(dialog).getByRole("textbox", { name: "Nombre del cliente" })).toBe(document.activeElement);
    expect(within(dialog).queryByRole("combobox", { name: /estado/i })).toBeNull();
    expect(within(dialog).queryByRole("textbox", { name: "Observaciones" })).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "Herramientas (opcional)" })).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "Cuales herramientas" })).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "REP vinculada (opcional)" })).toBeTruthy();
    expect((dialog.querySelector('input[name="returnTo"]') as HTMLInputElement).value).toContain("view=week");
  });
  it("edits a saved visit without exposing assignment or losing notes, REP or schedule", () => {
    render(<VisitsView canManage canDelete data={{ ...data, visits: [visit] }} message={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("combobox", { name: /tecnico/i })).toBeNull();
    expect(dialog.querySelector('[name="technicianId"]')).toBeNull();
    expect((within(dialog).getByLabelText("Estado de la visita") as HTMLSelectElement).value).toBe("confirmada");
    expect((within(dialog).getByLabelText("REP vinculada (opcional)") as HTMLInputElement).value).toBe("REP-000266");
    expect((within(dialog).getByLabelText("Hora desde") as HTMLInputElement).value).toBe("09:00");
    expect((within(dialog).getByLabelText("Observaciones") as HTMLTextAreaElement).value).toBe(visit.notes);
  });
  it("keeps a new draft after Escape and explicitly recovers it on reopen", () => {
    render(<VisitsView canManage canDelete draftOwnerId="admin" data={data} message={null} />);
    const trigger = screen.getByRole("button", { name: "Nueva visita" });
    trigger.focus(); fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Nombre del cliente"), { target: { value: "Borrador" } });
    fireEvent.change(screen.getByLabelText("Herramientas (opcional)"), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText("Cuales herramientas"), { target: { value: "Escalera" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Recuperar borrador" }));
    expect((screen.getByLabelText("Nombre del cliente") as HTMLInputElement).value).toBe("Borrador");
    expect((screen.getByLabelText("Herramientas (opcional)") as HTMLSelectElement).value).toBe("yes");
    expect((screen.getByLabelText("Cuales herramientas") as HTMLInputElement).value).toBe("Escalera");
  });
  it("closes the editor on acknowledged save but leaves it open on an error", () => {
    const { rerender } = render(<VisitsView canManage canDelete data={data} message={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva visita" }));
    rerender(<VisitsView canManage canDelete data={data} message={{ success: false, message: "No se pudo guardar" }} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe("No se pudo guardar");
    rerender(<VisitsView canManage canDelete data={data} savedDraftToken="saved-token" savedDraftVisitId="new" message={{ success: true, message: "Visita guardada" }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("allows closing a recovered-draft prompt without discarding it", () => {
    render(<VisitsView canManage canDelete draftOwnerId="admin" data={data} message={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva visita" }));
    fireEvent.change(screen.getByLabelText("Nombre del cliente"), { target: { value: "Pendiente" } });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Nueva visita" }));
    expect((screen.getByRole("button", { name: "Cerrar" }) as HTMLButtonElement).matches(":disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nueva visita" }));
    expect(screen.getByRole("button", { name: "Recuperar borrador" })).toBeTruthy();
  });
});
