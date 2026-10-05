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
    const limit = vi.fn().mockResolvedValue({
      data: [{
        id: "outsourcing-1",
        repair_access_order_id: "order-1",
        workshop_name: "Taller",
        sent_at: "2026-09-18",
        retrieved_at: null,
        status: "en_taller",
        notes: null,
        created_at: "2026-09-18T12:00:00Z",
        repair_access_orders: null
      }],
      error: null
    });
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ neq }));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ from: () => ({ select }) } as never);

    const result = await getRepairOutsourcingDashboard();

    expect(result.summary.sentToday).toBe(1);
  });
});
