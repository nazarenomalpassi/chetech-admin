import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), cap: 500, boards: [] as Record<string, unknown>[], events: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { getTvBoards, getTvBoardsPageData } from "./queries";

const board = { id: "a", brand: "LG", model: "Smart", board_type: "main", listed_price: 500000, acquisition_cost: 10000, is_active: false, sold_at: "2026-10-01", mercado_libre_net_amount: "104000.25", release_date: "2026-10-02", released_at: null, sale_notes: null, claim_status: "none", financial_version: 1, created_at: "2026-10-01", updated_at: "2026-10-01" };
beforeEach(() => {
  mocks.select.mockClear();
  mocks.boards = [board]; mocks.events = []; mocks.cap = 500;
  mocks.from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = (columns: string) => { mocks.select(table, columns); return builder; };
    for (const key of ["order", "eq"]) builder[key] = () => builder;
    builder.range = (from: number, to: number) => {
      const rows = table === "tv_boards" ? mocks.boards : mocks.events;
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + mocks.cap)), count: rows.length, error: null });
    };
    return builder;
  });
});
describe("TV board financial read paths", () => {
  it.each([false, true])("reads the unique linked sale and payment account (array relation: %s)", async (arrayRelation) => {
    const sale = { id: "sale-1", sale_number: "V-0101", sale_payments: [{ method: "mp", amount: "104000.25" }] };
    mocks.boards = [{ ...board, sales: arrayRelation ? [sale] : sale }];
    expect((await getTvBoards())[0].linkedSale).toEqual({ id: "sale-1", number: "V-0101", method: "mp" });
    expect(mocks.select).toHaveBeenCalledWith("tv_boards", expect.stringContaining("sales(id,sale_number,sale_payments(method,amount))"));
  });
  it("keeps legacy releases unlinked instead of inferring a sale or destination", async () => {
    mocks.boards = [{ ...board, released_at: "2026-10-20", sales: [] }];
    const row = (await getTvBoards())[0];
    expect(row.linkedSale).toBeNull();
    expect(row.saleStatus).toBe("released");
  });
  it("filters pending and held independently of the estimated date", async () => {
    mocks.boards.push({ ...board, id: "b", claim_status: "open", claim_opened_at: "2026-10-20", financial_version: 2 });
    expect((await getTvBoards({ status: "pending_release" })).map(b => b.id)).toEqual(["a"]);
    expect((await getTvBoards({ status: "claim_open" })).map(b => b.id)).toEqual(["b"]);
  });
  it("keeps global money and claims visible when the inventory is filtered", async () => {
    mocks.boards.push({ ...board, id: "b", claim_status: "open", claim_opened_at: "2026-10-20" });
    const page = await getTvBoardsPageData({ search: "No match", status: "active" });
    expect(page.boards).toHaveLength(0);
    expect(page.claims).toHaveLength(1);
    expect(page.summary).toMatchObject({ pendingAmount: 104000.25, heldAmount: 104000.25, releasedAmount: 0 });
  });
  it("reads beyond the server page and preserves immutable event history", async () => {
    mocks.boards = Array.from({ length: 505 }, (_, n) => ({ ...board, id: `board-${n}` }));
    mocks.events = [{ id: "event", board_id: "board-504", kind: "start_claim", notes: "Internal claim", net_amount: 104000.25, created_at: "2026-10-20" }];
    const rows = await getTvBoards();
    expect(rows).toHaveLength(505);
    expect(rows.find(b => b.id === "board-504")?.events[0]).toMatchObject({ kind: "start_claim", netAmount: 104000.25 });
  });
  it("does not show a missing claim table as a valid zero", async () => {
    mocks.from.mockReturnValue({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: { code: "42P01", message: "Unavailable" } }) }) }) });
    await expect(getTvBoards()).rejects.toThrow();
  });
  it("keeps all 1007 boards and events when the server cap is below the requested page size", async () => {
    mocks.cap = 37;
    mocks.boards = Array.from({ length: 1007 }, (_, index) => ({ ...board, id: `b-${index}` }));
    mocks.events = mocks.boards.map(row => ({ id: `e-${row.id}`, board_id: row.id, kind: "resume_sale", notes: "Restored", net_amount: 104000.25, created_at: "2026-10-20" }));
    const page = await getTvBoardsPageData();
    expect(page.boards).toHaveLength(1007);
    expect(page.boards.every(row => row.events.length === 1)).toBe(true);
    expect(page.summary.pendingAmount).toBe(104000.25 * 1007);
  });
});
