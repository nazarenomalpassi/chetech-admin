import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
import { mapOrder } from "./queries";
import { repairAccessIntakeSchema } from "./schemas";

const base = { customerName: "Belén Pérez", customerPhone: "3571123456", deviceType: "Televisor", intakeDate: "2026-10-07", issueReported: "No enciende" };
function mapDevice(device: Record<string, unknown>) {
  return mapOrder({ id: "00000000-0000-4000-8000-000000000001", repair_number: "REP-000357", status: "pendiente_revision", repair_access_devices: device } as any).device;
}
describe("intake color contract", () => {
  it("accepts and trims a new color without combining it with visual condition", () => {
    const result = repairAccessIntakeSchema.parse({ ...base, deviceColor: "  Gris  ", visualCondition: "Rayas en la base" });
    expect(result).toMatchObject({ deviceColor: "Gris", visualCondition: "Rayas en la base" });
  });
  it("rejects an oversized color before any save", () => {
    expect(repairAccessIntakeSchema.safeParse({ ...base, deviceColor: "x".repeat(81) }).success).toBe(false);
  });
  it("keeps older clients with no color field compatible", () => {
    expect(repairAccessIntakeSchema.parse(base)).not.toHaveProperty("deviceColor");
  });
  it("maps explicit color separately from the historical visual condition", () => {
    expect(mapDevice({ color: "Azul", visual_condition: "Color: Negro", accessory_details: "Control", serial_number: "SERIE-1" })).toMatchObject({ color: "Azul", visualCondition: "Color: Negro", accessoryDetails: "Control", serialNumber: "SERIE-1" });
  });
  it("reads only an explicit legacy Color prefix and never invents color from damage notes", () => {
    expect(mapDevice({ color: null, visual_condition: "Color: Negro" }).color).toBe("Negro");
    expect(mapDevice({ visual_condition: "Rayas en la base" }).color).toBe("");
    expect(mapDevice({ color: "", visual_condition: "Color: Negro" }).color).toBe("");
  });
});
