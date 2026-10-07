import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin, requirePermission: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
import { saveRepairAccessOrderAction } from "./actions";

const id = "00000000-0000-4000-8000-000000000357";
function form(color?: string) {
  const data = new FormData();
  const values = { customerName: "Belén Pérez", customerPhone: "3571123456", customerAddress: "Direccion sintetica", customerAlternatePhone: "", customerDni: "", customerEmail: "", customerNotes: "", deviceType: "Televisor", deviceBrand: "LG", deviceModel: "Modelo", serialNumber: "SERIE-123", accessoryDetails: "Control y cable", visualCondition: "Rayas en la base", intakeDate: "2026-10-07", issueReported: "No enciende", priority: "normal", notes: "", status: "pendiente_revision" };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (color !== undefined) data.set("deviceColor", color);
  return data;
}
describe("complete reception sheet persistence", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id, role: "admin" }); mocks.rpc.mockResolvedValue({ data: { id }, error: null }); });
  it("sends color, address, serial, accessories and condition in the same atomic save", async () => {
    await expect(saveRepairAccessOrderAction(form(" Gris "))).rejects.toThrow(`order=${id}`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_repair_access_intake", { p_payload: expect.objectContaining({ device_color: "Gris", customer_name: "Belén Pérez", customer_address: "Direccion sintetica", serial_number: "SERIE-123", accessory_details: "Control y cable", visual_condition: "Rayas en la base" }) });
  });
  it("distinguishes an explicit color clear from an omitted field on older forms", async () => {
    await expect(saveRepairAccessOrderAction(form(""))).rejects.toThrow(`order=${id}`);
    expect(mocks.rpc.mock.calls[0][1].p_payload.device_color).toBe("");
    mocks.rpc.mockClear();
    await expect(saveRepairAccessOrderAction(form())).rejects.toThrow(`order=${id}`);
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toHaveProperty("device_color");
  });
  it("does not save anything when color is invalid", async () => {
    await expect(saveRepairAccessOrderAction(form("x".repeat(81)))).rejects.toThrow(/error=/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns an editing save error to the same reception sheet", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "No se pudo guardar" } });
    const data = form("Gris"); data.set("id", id);
    await expect(saveRepairAccessOrderAction(data)).rejects.toThrow(`order=${id}&view=nueva`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("keeps the existing administrator requirement", async () => {
    mocks.admin.mockRejectedValue(new Error("Acceso denegado"));
    await expect(saveRepairAccessOrderAction(form("Negro"))).rejects.toThrow("Acceso denegado");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
