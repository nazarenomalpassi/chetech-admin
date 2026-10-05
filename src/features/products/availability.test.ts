import { describe, expect, it, vi } from "vitest";
import { getProductAvailability } from "./availability";

describe("optional read-only workshop stock availability", () => {
  it("batches only current page IDs in groups of at most 50 and preserves actual values", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `product-${i}`);
    const rpc = vi.fn(async (_name: string, args: { p_product_ids: string[] }) => ({ data: args.p_product_ids.map(id => ({ id, reserved: 3, available: 4 })), error: null }));
    const result = await getProductAvailability({ rpc }, ids);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.every(([name, args]) => name === "get_workshop_product_availability" && args.p_product_ids.length <= 50)).toBe(true);
    expect(result.values.get(ids[0])).toEqual({ reserved: 3, available: 4 });
    expect(result.status).toBe("ready");
  });
  it("treats a missing migration as unknown availability, never inventing free stock", async () => {
    const result = await getProductAvailability({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_workshop_product_availability" } }) }, ["product"]);
    expect(result.status).toBe("not-deployed");
    expect(result.values.size).toBe(0);
  });
  it("does not break the catalog on denied or malformed optional RPC data", async () => {
    const denied = await getProductAvailability({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } }) }, ["product"]);
    expect(denied.status).toBe("unavailable");
    const invalid = await getProductAvailability({ rpc: vi.fn().mockResolvedValue({ data: [{ id: "product", reserved: -1, available: "private" }], error: null }) }, ["product"]);
    expect(invalid.values.size).toBe(0);
    expect(invalid.status).toBe("unavailable");
  });
  it("makes no call for an empty page", async () => {
    const rpc = vi.fn();
    await getProductAvailability({ rpc }, []);
    expect(rpc).not.toHaveBeenCalled();
  });
});
