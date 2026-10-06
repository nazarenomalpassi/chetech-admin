import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission, requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveWorkshopForm, claimRepairOrder } from "./coordination-actions";
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "tech", role: "tecnico" }); mocks.rpc.mockResolvedValue({ data: {}, error: null }); });
function form() { const data = new FormData(); data.set("id", "10000000-0000-4000-8000-000000000001"); data.set("status", "en_revision"); data.set("expectedVersion", "3"); return data; }
describe("guardado breve del taller", () => {
  it("no reemplaza por cero el importe de un campo protegido y ausente", async () => {
    expect((await saveWorkshopForm(null, form())).success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("budget_amount");
  });
  it("envia el presupuesto ingresado sin marcar cobro, entrega ni aprobacion", async () => {
    const data = form(); data.set("repairAmount", "25000");
    await saveWorkshopForm(null, data);
    const payload = mocks.rpc.mock.calls[0][1].p_payload;
    expect(payload.budget_amount).toBe(25000);
    for (const key of ["is_paid", "picked_up_at", "approval_status"]) expect(payload).not.toHaveProperty(key);
  });
  it("muestra el conflicto y no invalida vistas como si hubiera guardado", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "40001", message: "stale" } });
    expect((await saveWorkshopForm(null, form())).message).toContain("otro dispositivo");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("toma una orden con la version exacta y sin aceptar un responsable arbitrario", async () => {
    const data = form(); data.set("version", "3"); data.set("technicianId", "otra-persona");
    await claimRepairOrder(null, data);
    expect(mocks.rpc.mock.calls[0]).toEqual(["workshop_claim_order", { p_order_id: "10000000-0000-4000-8000-000000000001", p_expected_version: 3 }]);
  });
});
