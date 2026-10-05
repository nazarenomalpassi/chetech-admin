import { describe, expect, it, vi } from "vitest";

import { applyStableCreationOrder, getRepairWriteDates } from "@/lib/chronology";

describe("stable creation chronology", () => {
  it("orders by exact creation timestamp and then by primary key", () => {
    const query = {
      order: vi.fn()
    };
    query.order.mockReturnValue(query);

    expect(applyStableCreationOrder(query)).toBe(query);
    expect(query.order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }]
    ]);
  });

  it("keeps the repair business date separate from database timestamps", () => {
    expect(getRepairWriteDates("2026-07-31")).toEqual({
      entry_date: "2026-07-31"
    });
  });
});
