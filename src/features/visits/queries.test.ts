import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVisitsData } from "./queries";
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  query = {};
  for (const method of ["select", "limit", "range", "or", "eq", "gte", "lte", "is", "order"]) query[method] = vi.fn(() => query);
  query.then = vi.fn((resolve) => resolve({ data: [], error: null, count: 601 }));
  const profiles: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "in", "order"]) profiles[method] = vi.fn(() => profiles);
  profiles.then = vi.fn((resolve) => resolve({ data: [{ id: "tech", full_name: "Juan" }], error: null }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from: (table: string) => table === "profiles" ? profiles : query } as never);
});
describe("server-side visit filters", () => {
  it("counts before fetching so an out-of-range request cannot trigger a 416", async () => {
    query.then.mockImplementation((resolve) => {
      const lastRange = query.range.mock.calls.at(-1);
      return resolve(lastRange && lastRange[0] > 600 ? { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" }, count: null } : { data: [], error: null, count: 601 });
    });
    const result = await getVisitsData({ page: "99999" });
    expect(result.pagination.page).toBe(25);
    expect(query.range).toHaveBeenCalledWith(600, 624);
  });
  it("loads history beyond row 300 with stable server pagination and preserved week filters", async () => {
    const result = await getVisitsData({ page: "13", date: "2027-01-03", view: "week" });
    expect(query.range).toHaveBeenCalledWith(300, 324);
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.limit).not.toHaveBeenCalled();
    expect(result.pagination).toMatchObject({ page: 13, total: 601, hasNextPage: true });
    expect(query.gte).toHaveBeenCalledWith("visit_date", "2026-12-28");
  });
  it("filters a complete week in SQL rather than hiding loaded rows in the client", async () => {
    const technicianId = "11111111-1111-4111-8111-111111111111";
    const result = await getVisitsData({ date: "2027-01-03", view: "week", technicianId });
    expect(query.gte).toHaveBeenCalledWith("visit_date", "2026-12-28");
    expect(query.lte).toHaveBeenCalledWith("visit_date", "2027-01-03");
    expect(query.eq).toHaveBeenCalledWith("technician_id", technicianId);
    expect(result.filters).toMatchObject({ view: "week", technicianId });
    expect(result.technicians).toEqual([{ id: "tech", full_name: "Juan" }]);
  });
  it("supports an exact day and an unassigned technician filter", async () => {
    await getVisitsData({ date: "2026-10-05", view: "day", technicianId: "unassigned" });
    expect(query.gte).toHaveBeenCalledWith("visit_date", "2026-10-05");
    expect(query.lte).toHaveBeenCalledWith("visit_date", "2026-10-05");
    expect(query.is).toHaveBeenCalledWith("technician_id", null);
  });
});
