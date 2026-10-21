import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: () => {
  const query = { select: mocks.select, order: () => query, range: async () => ({ data: [], count: 0, error: null }) };
  mocks.select.mockReturnValue(query);
  return query;
} }) }));
import { getSalesHistory } from "./queries";

beforeEach(() => { vi.clearAllMocks(); });

it("selects board origin and item snapshots in the sales history request", async () => {
  await getSalesHistory();
  const columns = String(mocks.select.mock.calls[0][0]);
  expect(columns).toContain("tv_board_id");
  expect(columns).toContain("sale_items(product_id, description,");
});
