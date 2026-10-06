// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../coordination-actions", () => ({ saveWorkshopForm: mocks.save }));
import { WorkshopForm } from "./workshop-form";
Object.assign(globalThis, { React });
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("borrador del taller", () => {
  it("expone el borrador al editor sin perder el dato escrito", async () => {
    render(<WorkshopForm orderId="quick-order" orderVersion={1}>{(fields) => <><input name="expectedVersion" type="hidden" value={1} /><input aria-label="Presupuesto" name="repairAmount" defaultValue="100" /><p>{fields.repairAmount || "100"}</p></>}</WorkshopForm>);
    fireEvent.change(screen.getByLabelText("Presupuesto"), { target: { value: "200" } });
    expect(screen.getByText("200")).toBeTruthy();
  });
  it("reintenta la misma solicitud con la misma identidad y cambia identidad al editar", async () => {
    mocks.save.mockRejectedValue(new Error("network"));
    render(<WorkshopForm orderId="quick-order" orderVersion={1}><input name="expectedVersion" type="hidden" value={1} /><textarea aria-label="Avance" name="repairProgress" /><button type="submit">Guardar</button></WorkshopForm>);
    const form = screen.getByRole("button", { name: "Guardar" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Avance"), { target: { value: "Prueba inicial" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const first = mocks.save.mock.calls[0][1].get("operationId");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].get("operationId")).toBe(first);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Avance"), { target: { value: "Prueba nueva" } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][1].get("operationId")).not.toBe(first);
  });
  it("envia la version con la que se inicio la edicion aunque llegue una actualizacion remota", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "Conflicto" });
    const content = (version: number) => <WorkshopForm orderId="test-order" orderVersion={version}><input name="expectedVersion" type="hidden" value={version} /><textarea name="repairProgress" aria-label="Avance" /><button type="submit">Guardar</button></WorkshopForm>;
    const view = render(content(1));
    fireEvent.change(screen.getByLabelText("Avance"), { target: { value: "Mi avance" } });
    view.rerender(content(2));
    fireEvent.submit(screen.getByRole("button", { name: "Guardar" }).closest("form")!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][1].get("expectedVersion")).toBe("1");
    expect((screen.getByLabelText("Avance") as HTMLTextAreaElement).value).toBe("Mi avance");
  });
  it("conserva el avance y muestra el conflicto sin refrescar", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "Cambio en otro dispositivo" });
    render(<WorkshopForm orderId="test-order"><textarea name="repairProgress" aria-label="Avance" /><button type="submit">Guardar</button></WorkshopForm>);
    fireEvent.change(screen.getByLabelText("Avance"), { target: { value: "Fuente revisada" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("otro dispositivo"));
    expect((screen.getByLabelText("Avance") as HTMLTextAreaElement).value).toBe("Fuente revisada");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("no confirma un guardado si falla la red", async () => {
    mocks.save.mockRejectedValue(new Error("network error"));
    render(<WorkshopForm orderId="test-order"><textarea name="repairProgress" aria-label="Avance" /><button type="submit">Guardar</button></WorkshopForm>);
    fireEvent.change(screen.getByLabelText("Avance"), { target: { value: "Probando" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No se pudo confirmar"));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
