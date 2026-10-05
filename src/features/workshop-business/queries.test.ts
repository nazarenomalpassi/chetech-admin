import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
import { getWorkshopBusinessReport } from "./queries";
import { reportFixture } from "./test-fixture";
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ role: "admin" }); });
describe("workshop aggregate query", () => {
  it("does not replace a missing RPC with misleading zero totals", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const result = await getWorkshopBusinessReport("2026-10-01", "2026-10-05");
    expect(result.report).toBeNull(); expect(result.migrationReady).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("get_workshop_business_report", { p_from: "2026-10-01", p_to: "2026-10-05" });
  });
  it("requires report authorization before querying and propagates forbidden errors", async () => {
    mocks.auth.mockRejectedValue(new Error("denied"));
    await expect(getWorkshopBusinessReport()).rejects.toThrow("denied"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns the validated intake-cohort report and keeps financial nulls intact", async () => {
    mocks.rpc.mockResolvedValue({ data: reportFixture, error: null });
    const result = await getWorkshopBusinessReport("2026-10-05", "2026-10-01");
    expect(result.range).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(result.report?.totals.collected).toBe(520);
    expect(result.report?.totals.directMargin).toBeNull();
    expect(mocks.auth).toHaveBeenCalledWith("reports.manage");
  });
  it("does not mask schema or authorization failures as an empty report", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Solo administradores" } });
    await expect(getWorkshopBusinessReport()).rejects.toThrow("Solo administradores");
  });
});
