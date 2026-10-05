import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), audit: vi.fn(), update: vi.fn(), read: vi.fn(), is: vi.fn(), gt: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { markTvBoardReleasedAction } from "./actions";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "actor" });
  const query = { select: vi.fn(), eq: vi.fn(), is: mocks.is, not: vi.fn(), gt: mocks.gt, update: mocks.update, maybeSingle: mocks.read };
  for (const method of [query.select, query.eq, query.is, query.not, query.gt, query.update]) method.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.read.mockResolvedValueOnce({ data: { sold_at: "2026-01-01", release_date: "2026-01-02", released_at: null }, error: null }).mockResolvedValue({ data: { id }, error: null });
});
describe("board release confirmation", () => {
  it("can confirm an overdue estimate and records the actor without creating cash movements", async () => {
    expect((await markTvBoardReleasedAction(id)).success).toBe(true);
    expect(mocks.gt).not.toHaveBeenCalled();
    expect(mocks.is).toHaveBeenCalledWith("released_at", null);
    expect(mocks.from.mock.calls.every(([table]) => table === "tv_boards")).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: "actor" }));
  });
  it("rejects duplicate confirmation", async () => {
    mocks.read.mockReset().mockResolvedValue({ data: { sold_at: "2026-01-01", released_at: "2026-01-02" }, error: null });
    expect((await markTvBoardReleasedAction(id)).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("handles concurrent changes without claiming confirmation", async () => {
    mocks.read.mockReset().mockResolvedValueOnce({ data: { sold_at: "2026-01-01", released_at: null }, error: null }).mockResolvedValue({ data: null, error: null });
    expect((await markTvBoardReleasedAction(id)).success).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
