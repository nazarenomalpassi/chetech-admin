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
