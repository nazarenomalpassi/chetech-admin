import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), rpc: vi.fn(), audit: vi.fn(), update: vi.fn(), read: vi.fn(), is: vi.fn(), gt: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { markTvBoardReleasedAction, markTvBoardSoldAction } from "./actions";
const id = "11111111-1111-4111-8111-111111111111";
const release = { id, version: 1, operationId: "22222222-2222-4222-8222-222222222222" };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "actor" });
  const query = { select: vi.fn(), eq: vi.fn(), is: mocks.is, not: vi.fn(), gt: mocks.gt, update: mocks.update, maybeSingle: mocks.read };
  for (const method of [query.select, query.eq, query.is, query.not, query.gt, query.update]) method.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.read.mockResolvedValueOnce({ data: { sold_at: "2026-01-01", release_date: "2026-01-02", released_at: null }, error: null }).mockResolvedValue({ data: { id }, error: null });
  mocks.rpc.mockResolvedValue({ data: { id, version: 2, kind: "confirm_release", status: "released", replayed: false }, error: null });
});
describe("board release confirmation", () => {
  it("can confirm an overdue estimate and records the actor without creating cash movements", async () => {
    expect((await markTvBoardReleasedAction(release)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("tv_board_sale_transition", expect.objectContaining({ p_board_id: id, p_expected_version: 1, p_kind: "confirm_release" }));
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects duplicate confirmation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "Ya confirmada" } });
    expect((await markTvBoardReleasedAction(release)).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("handles concurrent changes without claiming confirmation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Stale" } });
    expect((await markTvBoardReleasedAction(release)).success).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("first board sale concurrency guard", () => {
  it("never reports success when another device sold the board first", async () => {
    mocks.read.mockReset().mockResolvedValueOnce({ data: { id, brand: "LG", model: "TV", sold_at: null }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const result = await markTvBoardSoldAction({ id, netAmount: 100, releaseDate: "2026-10-20", notes: "" });
    expect(result.success).toBe(false);
    expect(mocks.is).toHaveBeenCalledWith("sold_at", null);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
