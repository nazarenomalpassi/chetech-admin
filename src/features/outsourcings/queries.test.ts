import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn()
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRepairOutsourcingDashboard } from "@/features/outsourcings/queries";

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("getRepairOutsourcingDashboard", () => {
  it("counts orders sent today according to the operational day, not UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T01:30:00.000Z"));
    const rpc = vi.fn().mockResolvedValue({
      data: { total: 1, page: 1, summary: { sentToday: 1 }, records: [{
        id: "outsourcing-1",
        repair_access_order_id: "order-1",
        workshop_name: "Taller",
        sent_at: "2026-09-18",
        retrieved_at: null,
        status: "en_taller",
        notes: null,
        created_at: "2026-09-18T12:00:00Z",
        repair_access_orders: null
      }] },
      error: null
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    const result = await getRepairOutsourcingDashboard();

    expect(result.summary.sentToday).toBe(1);
  });
  it("queries beyond the former cap with server search and week filters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { total: 601, page: 13, records: [], summary: { total: 601 } }, error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
    const result = await getRepairOutsourcingDashboard({ page: "13", search: "Cliente", status: "todos", date: "2027-01-03", view: "week" });
    expect(rpc).toHaveBeenCalledWith("get_operations_outsourcings_page", { p_page: 13, p_search: "Cliente", p_status: "todos", p_from: "2026-12-28", p_to: "2027-01-03" });
    expect(result.pagination).toMatchObject({ page: 13, total: 601, hasNextPage: true });
  });
});
