import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProductCategories, getProductPage } from "./queries";

const calls: { method: string; args: unknown[] }[] = [];
let results: { data: unknown[]; count: number | null; error: { message: string } | null }[];
function query() {
  const builder: any = {};
  for (const method of ["select", "order", "eq", "or", "range"]) {
    builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder; };
  }
  builder.then = (done: (value: unknown) => unknown) => Promise.resolve(results.shift()).then(done);
  return builder;
}
beforeEach(() => {
  calls.length = 0;
  results = [{ data: [{ id: "p-51", sku: "CAB-51", name: "Cable", cost: 6, sale_price: 10, stock: 7, min_stock: 2, is_active: true, notes: "Keep", category_id: "11111111-1111-4111-8111-111111111111", categories: { name: "Cables" } }], count: 71, error: null }];
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from: vi.fn(query), rpc: vi.fn((name: string) => name === "get_workshop_product_availability" ? Promise.resolve({ data: null, error: { code: "PGRST202" } }) : query()) } as never);
});
describe("server product pagination", () => {
  it("applies filters and stable ordering before fetching only the requested page", async () => {
    const page = await getProductPage({ page: "3", search: "cable CAB-51", category: "11111111-1111-4111-8111-111111111111", status: "active", includeCosts: true });
    expect(calls).toContainEqual({ method: "range", args: [50, 74] });
    expect(calls).toContainEqual({ method: "eq", args: ["is_active", true] });
    expect(calls).toContainEqual({ method: "order", args: ["id", { ascending: true }] });
    expect(calls.filter(call => call.method === "or")).toHaveLength(1);
    expect(page.pagination).toMatchObject({ page: 3, total: 71, totalPages: 3 });
    expect(page.products[0]).toMatchObject({ sku: "CAB-51", cost: 6, stock: 7, notes: "Keep", category: "Cables" });
  });
  it("uses the restricted technician RPC and never fetches product costs", async () => {
    const page = await getProductPage({ page: "2", status: "inactive", search: "cable" });
    const db = await createServerSupabaseClient();
    expect((db as any).from).not.toHaveBeenCalled();
    expect((db as any).rpc).toHaveBeenCalledWith("get_technician_product_catalog", { p_search: null, p_category: null, p_status: "inactive" }, { count: "exact" });
    expect(page.products[0].cost).toBe(0);
    expect(calls).toContainEqual({ method: "range", args: [25, 49] });
  });
  it("clamps stale pages and refetches the last available page", async () => {
    results = [{ data: [], count: 26, error: null }, { data: [{ id: "last", stock: 0 }], count: 26, error: null }];
    const page = await getProductPage({ page: "99", includeCosts: true });
    expect(page.pagination.page).toBe(2);
    expect(page.products[0].id).toBe("last");
    expect(calls).toContainEqual({ method: "range", args: [25, 49] });
  });
  it("recovers from a real PostgREST out-of-range response with a filtered head count", async () => {
    results = [{ data: [], count: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } } as never, { data: [], count: 26, error: null }, { data: [{ id: "last", stock: 0 }], count: 26, error: null }];
    const page = await getProductPage({ page: "99", status: "active", includeCosts: true });
    expect(page.pagination.page).toBe(2);
    expect(page.products[0].id).toBe("last");
    expect(calls.some(call => call.method === "select" && (call.args[1] as { head?: boolean })?.head)).toBe(true);
  });
  it("rejects failed counts instead of displaying a false empty catalogue", async () => {
    results = [{ data: [], count: null, error: null }];
    await expect(getProductPage({ includeCosts: true })).rejects.toThrow(/count|conteo/i);
  });
  it("integrates availability for only the fetched page while leaving physical stock untouched", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "p-51", reserved: 3, available: 4 }], error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ from: vi.fn(query), rpc } as never);
    const page = await getProductPage({ includeCosts: true });
    expect(rpc).toHaveBeenCalledWith("get_workshop_product_availability", { p_product_ids: ["p-51"] });
    expect(page.products[0]).toMatchObject({ stock: 7, reservedStock: 3, availableStock: 4 });
    expect(page.availabilityStatus).toBe("ready");
  });
  it("keeps old-schema catalogs usable without fabricated reservation values", async () => {
    const page = await getProductPage({ includeCosts: true });
    expect(page.products[0]).toMatchObject({ stock: 7, reservedStock: null, availableStock: null });
    expect(page.availabilityStatus).toBe("not-deployed");
  });
  it("does not download the entire inventory to populate category options when the count RPC is absent", async () => {
    const categoryQuery = query();
    categoryQuery.then = (done: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: "cat", name: "Category", sku_prefix: "CAT" }], error: null }).then(done);
    const from = vi.fn(() => categoryQuery);
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: { code: "PGRST202", message: "Could not find the function public.get_product_category_counts" } }), from } as never);
    const categories = await getProductCategories();
    expect(from.mock.calls.every(call => (call as unknown[])[0] === "categories")).toBe(true);
    expect(categories[0]).toMatchObject({ id: "cat", name: "Category", skuPrefix: "CAT" });
  });
});
