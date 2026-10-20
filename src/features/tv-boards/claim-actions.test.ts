import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { changeTvBoardSaleAction, refreshTvBoardSaleStateAction } from "./claim-actions";

const input = { id: "11111111-1111-4111-8111-111111111111", version: 1, operationId: "22222222-2222-4222-8222-222222222222", kind: "start_claim", notes: "Reclamo del comprador" };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "actor" });
  mocks.rpc.mockResolvedValue({ data: { id: input.id, version: 2, status: "claim_open", kind: "start_claim", replayed: false }, error: null });
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: input.id, financial_version: 3, claim_status: "open", sold_at: "2026-10-20", released_at: null }, error: null }) };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); mocks.from.mockReturnValue(builder);
});
describe("TV board atomic sale actions", () => {
  it("starts a claim through the atomic RPC and refreshes both financial views", async () => {
    expect(await changeTvBoardSaleAction(input)).toMatchObject({ success: true, recordVersion: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("tv_board_sale_transition", { p_board_id: input.id, p_expected_version: 1, p_operation_id: input.operationId, p_kind: "start_claim", p_notes: input.notes });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidate).toHaveBeenCalledWith("/placas-tv");
    expect(mocks.auth).toHaveBeenCalledOnce();
  });
  it("rejects malformed input before the RPC", async () => {
    expect((await changeTvBoardSaleAction({ ...input, version: 0 })).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps stale and database failures as failures", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "stale" } });
    expect(await changeTvBoardSaleAction(input)).toMatchObject({ success: false, conflict: true, message: expect.stringContaining("otro dispositivo") });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([{ id: input.operationId }, { status: "released" }, { kind: "cancel_sale" }, { version: 0 }, { version: 1 }, { replayed: "false" }])("does not claim success for an invalid receipt %j", async (patch) => {
    mocks.rpc.mockResolvedValue({ data: { id: input.id, version: 2, status: "claim_open", kind: "start_claim", replayed: false, ...patch }, error: null });
    expect((await changeTvBoardSaleAction(input)).success).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("accepts an exact idempotent replay", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: input.id, version: 2, status: "claim_open", kind: "start_claim", replayed: true }, error: null });
    expect((await changeTvBoardSaleAction(input)).success).toBe(true);
  });
  it("does not expose raw unexpected DB errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret database detail" } });
    expect((await changeTvBoardSaleAction(input)).message).not.toContain("secret");
  });
});

describe("read-only claim conflict recovery", () => {
  it("returns the current authorized version and lifecycle without mutating or revalidating", async () => {
    expect(await refreshTvBoardSaleStateAction(input.id)).toMatchObject({ success: true, state: { id: input.id, version: 3, status: "claim_open" } });
    expect(mocks.from).toHaveBeenCalledWith("tv_boards");
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not query malformed IDs", async () => {
    expect((await refreshTvBoardSaleStateAction("bad")).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not manufacture a state on a missing row", async () => {
    mocks.from().maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await refreshTvBoardSaleStateAction(input.id)).success).toBe(false);
  });
});
