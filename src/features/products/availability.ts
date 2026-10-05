import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";

export type AvailabilityStatus = "ready" | "not-deployed" | "unavailable";
export type ProductAvailability = { reserved: number; available: number };
type AvailabilityClient = { rpc(name: string, args: { p_product_ids: string[] }): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

export async function getProductAvailability(db: AvailabilityClient, productIds: string[]) {
  const ids = [...new Set(productIds)];
  const values = new Map<string, ProductAvailability>();
  if (!ids.length) return { status: "ready" as AvailabilityStatus, values };
  const batches = [];
  for (let from = 0; from < ids.length; from += 50) batches.push(ids.slice(from, from + 50));
  try {
    const results = await Promise.all(batches.map(batch => db.rpc("get_workshop_product_availability", { p_product_ids: batch })));
    for (const result of results) {
      if (result.error) return { status: isMissingDatabaseFunctionError(result.error, "get_workshop_product_availability") ? "not-deployed" as const : "unavailable" as const, values: new Map<string, ProductAvailability>() };
      if (!Array.isArray(result.data)) throw new Error("Invalid optional availability payload");
      for (const row of result.data) {
        if (!row || !ids.includes(row.id) || values.has(row.id) || !Number.isSafeInteger(row.reserved) || row.reserved < 0 || !Number.isSafeInteger(row.available) || row.available < 0) throw new Error("Invalid optional availability values");
        values.set(row.id, { reserved: row.reserved, available: row.available });
      }
    }
    if (values.size !== ids.length) throw new Error("Incomplete optional availability payload");
    return { status: "ready" as AvailabilityStatus, values };
  } catch { return { status: "unavailable" as AvailabilityStatus, values: new Map<string, ProductAvailability>() }; }
}
