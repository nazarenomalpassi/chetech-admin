import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { releaseTvBoardToSaleAction } from "./release-actions";
const input = { id: "11111111-1111-4111-8111-111111111111", version: 1, operationId: "22222222-2222-4222-8222-222222222222", method: "nx" };
const receipt = { id: input.id, version: 2, status: "released", kind: "confirm_release", replayed: false,
  saleId: "33333333-3333-4333-8333-333333333333", saleNumber: "V-0100", method: "nx" };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "actor" }); mocks.rpc.mockResolvedValue({ data: receipt, error: null }); });
describe("board settlement", () => {
  it.each(["nx", "mp"])("posts once to the selected %s account using the atomic RPC", async (method) => {
    mocks.rpc.mockResolvedValue({ data: { ...receipt, method }, error: null });
    expect(await releaseTvBoardToSaleAction({ ...input, method })).toMatchObject({ success: true, recordVersion: 2, message: expect.stringContaining("V-0100") });
    expect(mocks.rpc).toHaveBeenCalledWith("release_tv_board_to_sale", { p_board_id: input.id, p_expected_version: 1, p_operation_id: input.operationId, p_method: method });
    for (const path of ["/placas-tv", "/ventas", "/caja", "/dashboard", "/reportes", "/sueldo"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });
  it.each([undefined, "efectivo", "transferencia"])("rejects an absent or unsupported destination %s", async (method) => {
    expect((await releaseTvBoardToSaleAction({ ...input, method })).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves conflict as a failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    expect(await releaseTvBoardToSaleAction(input)).toMatchObject({ success: false, conflict: true });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([{ saleId: null }, { method: "mp" }, { version: 1 }, { status: "pending_release" }, { saleNumber: "" }])("does not confirm malformed settlement receipts %j", async (patch) => {
    mocks.rpc.mockResolvedValue({ data: { ...receipt, ...patch }, error: null });
    expect((await releaseTvBoardToSaleAction(input)).success).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("accepts an exact replay without asking for a different operation", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...receipt, replayed: true }, error: null });
    expect((await releaseTvBoardToSaleAction(input)).success).toBe(true);
  });
});
