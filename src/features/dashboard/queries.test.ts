import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardData } from "@/features/dashboard/queries";

const mocks = vi.hoisted(() => ({ failure: "", products: [] as Array<{ id: string; name: string; stock: number; min_stock: number }>, from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks }));
vi.mock("@/lib/app-settings", () => ({ getCashSettings: async () => ({ openingBalances: { efectivo: 0, nx: 0, mp: 0 }, movementCutoff: "2026-01-01" }) }));
vi.mock("@/features/balance-transfers/queries", () => ({ getBalanceTransfers: async () => [] }));
vi.mock("@/features/installments/queries", () => ({ getDashboardInstallmentsData: async () => ({}) }));
vi.mock("@/features/visits/queries", () => ({ getVisitsTodayDashboardSummary: async () => ({}) }));

beforeEach(() => {
  mocks.failure = "";
  mocks.products = [];
  mocks.from.mockImplementation((table: string) => {
    let data = table === "products" ? mocks.products : [];
    const builder: Record<string, unknown> = { then: (resolve: (result: unknown) => void) => Promise.resolve({ data, error: mocks.failure === table ? { message: "Database unavailable" } : null }).then(resolve) };
    for (const method of ["select", "order", "not", "neq", "gte", "lt"]) builder[method] = () => builder;
    builder.limit = (size: number) => { data = data.slice(0, size); return builder; };
    builder.range = (from: number, to: number) => { data = data.slice(from, to + 1); return builder; };
    return builder;
  });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: [], error: mocks.failure === name ? { message: "Database unavailable" } : null }));
});

describe("dashboard data integrity", () => {
  it.each(["tv_boards", "invoices", "products", "get_top_products"])("does not present failed %s queries as zero or empty", async (query) => {
    mocks.failure = query;
    await expect(getDashboardData({})).rejects.toThrow();
  });
  it("still allows valid empty datasets", async () => {
    const result = await getDashboardData({});
    expect(result.salesTodayTotal).toBe(0);
    expect(result.pendingMercadoPagoReleaseAmount).toBe(0);
  });
  it("does not truncate replenishment alerts to the first 24 products", async () => {
    mocks.products = Array.from({ length: 35 }, (_, index) => ({ id: String(index), name: `Product ${index}`, stock: 0, min_stock: 1 }));
    const result = await getDashboardData({});
    expect(result.lowStockProducts).toHaveLength(35);
  });
});
