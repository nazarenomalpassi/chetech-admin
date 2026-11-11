// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepairQuickEditor } from "./repair-quick-editor";
import type { RepairAccessOrderRecord } from "../queries";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission, requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
Object.assign(globalThis, { React });

const order = {
  id: "10000000-0000-4000-8000-000000000001", status: "presupuestado_aceptado",
  budgetAmount: 100, budgetDetail: "Fuente", repairProgress: "", isPaid: false,
  customer: { fullName: "Cliente de prueba" },
  workflow: { version: 1, budgetRevision: 1, approvalStatus: "accepted", approvedAmount: 100,
    qualityCheckedAt: "2026-10-06", qualityNotes: "", parts: [], events: [] }
} as unknown as RepairAccessOrderRecord;

const quoteEdits = [["Presupuesto", "150"], ["Detalle del presupuesto", "Nuevo alcance"]] as const;

beforeEach(() => {
  mocks.permission.mockResolvedValue({ id: "admin", role: "admin" });
  mocks.rpc.mockImplementation(async (_name, args) => ({
    data: { id: order.id, version: 2, status: args.p_payload.status, replayed: false }, error: null
  }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("intencion de aceptacion desde el editor hasta el RPC", () => {
  it.each(quoteEdits)("editar %s de una orden aceptada guarda sin confirmar el nuevo presupuesto", async (label, value) => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText("Avance / trabajo realizado"), { target: { value: "Pendiente de autorizar" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_save_quick", expect.objectContaining({
      p_confirm_customer: false, p_channel: "", p_decision_notes: "",
      p_payload: expect.objectContaining({ status: "presupuestado", quality_checked: false,
        budget_amount: label === "Presupuesto" ? 150 : 100,
        budget_detail: label === "Detalle del presupuesto" ? value : "Fuente" })
    }));
    expect((screen.getByLabelText("Estado de la orden") as HTMLSelectElement).value).toBe("presupuestado");
  });

  it.each(quoteEdits)("permite aceptar explicitamente despues de editar %s", async (label, value) => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect((screen.getByLabelText("Estado de la orden") as HTMLSelectElement).value).toBe("presupuestado");
    fireEvent.change(screen.getByLabelText("Estado de la orden"), { target: { value: "presupuestado_aceptado" } });
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_save_quick", expect.objectContaining({
      p_confirm_customer: true, p_channel: "registro",
      p_payload: expect.objectContaining({ status: "presupuestado_aceptado", quality_checked: false })
    }));
  });

  it.each(quoteEdits)("permite confirmar con checkbox despues de editar %s", async (label, value) => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByLabelText("El cliente confirmo este presupuesto"));
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_save_quick", expect.objectContaining({
      p_confirm_customer: true,
      p_payload: expect.objectContaining({ status: "presupuestado", quality_checked: false })
    }));
  });

  it("un cambio de avance conserva la aceptacion y las pruebas del mismo presupuesto", async () => {
    render(<RepairQuickEditor order={order} canManage />);
    fireEvent.change(screen.getByLabelText("Avance / trabajo realizado"), { target: { value: "Fuente reparada" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("workshop_save_quick", expect.objectContaining({
      p_confirm_customer: true,
      p_payload: expect.objectContaining({ status: "presupuestado_aceptado", budget_amount: 100,
        budget_detail: "Fuente", repair_progress: "Fuente reparada", quality_checked: true })
    }));
    expect(screen.queryByLabelText("El cliente confirmo este presupuesto")).toBeNull();
  });
});
