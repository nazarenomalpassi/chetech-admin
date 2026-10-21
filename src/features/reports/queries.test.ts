import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), failure: "" }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks }));
vi.mock("@/lib/app-settings", () => ({ getBusinessGoals: async () => ({ salesTarget: 1000, profitTarget: 200, repairsTarget: 500, invoicingTarget: 1000 }) }));
import { getReportsData } from "./queries";

beforeEach(() => {
  mocks.failure = "";
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "get_reports_performance_snapshot not found" } });
  mocks.from.mockImplementation((table: string) => {
    const data = table === "sales" ? [{ subtotal: 1000, profit_total: null }, { subtotal: 100, profit_total: 60 }] : table === "sale_items" ? [
      { description: "Placa Samsung", quantity: 1, total: 1000, unit_cost: null, products: null },
      { description: "Placa LG", quantity: 1, total: 200, unit_cost: null, products: null },
      { quantity: 1, total: 100, unit_cost: 40, products: { name: "Cable", categories: { name: "Accesorios" } } },
      { quantity: 1, total: 30, unit_cost: 0, products: { name: "Muestra", categories: null } }
    ] : [];
    const builder: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => Promise.resolve({ data, error: mocks.failure === table ? { message: "read failed" } : null }).then(resolve) };
    for (const method of ["select", "gte", "lt", "neq", "in"]) builder[method] = () => builder;
    return builder;
  });
});

describe("report fallback cost integrity", () => {
  it("excludes unknown item costs from margins and reports their coverage", async () => {
    const result = await getReportsData("2026-10-01", "2026-10-05");
    expect(result.metrics.salesProfit).toBe(60);
    expect(result.metrics).toHaveProperty("salesUnknownCostCount", 1);
    const board = result.rankings.products.find((row) => row.label === "Placa Samsung");
    expect(board).toMatchObject({ revenue: 1000, profit: null, unknownCostCount: 1 });
    expect(result.rankings.products.find((row) => row.label === "Muestra")?.profit).toBe(30);
    expect(result.rankings.categories.find((row) => row.label === "Sin producto de inventario")).toMatchObject({ revenue: 1200, profit: null, unknownCostCount: 2 });
  });

  it("keeps non-inventory descriptions separate rather than inventing a stock product", async () => {
    const result = await getReportsData("2026-10-01", "2026-10-05");
    expect(result.rankings.products.map((row) => row.label)).toContain("Placa LG");
    expect(result.rankings.products.map((row) => row.label)).not.toContain("Producto sin nombre");
  });

  it("propagates missing reads instead of returning valid-looking zero metrics", async () => {
    mocks.failure = "sale_items";
    await expect(getReportsData("2026-10-01", "2026-10-05")).rejects.toThrow("read failed");
  });
});
