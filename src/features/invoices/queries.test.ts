import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: (table: string) => {
  let columns = "";
  const query = {
    select: (value: string) => { columns = value; mocks.select(table, value); return query; },
    order: () => query,
    eq: () => query,
    limit: async () => ({ error: null, data: table === "sales" ? [{
      id: "board-sale", sale_number: "V-0123", subtotal: "104000.25", sale_items: [{
        id: "board-item", product_id: null, products: null, quantity: 1, unit_price: "104000.25", total: "104000.25",
        ...(columns.includes("product_id, description,") ? { description: "Placa Main LG Smart" } : {})
      }]
    }] : [] })
  };
  return query;
} }) }));
import { getInvoiceFormOptions } from "./queries";

beforeEach(() => { vi.clearAllMocks(); });

it("passes a board item's requested snapshot and null product through invoice form options", async () => {
  const options = await getInvoiceFormOptions();
  expect(mocks.select).toHaveBeenCalledWith("sales", expect.stringContaining("sale_items(id, product_id, description,"));
  expect(options.sales[0].items[0]).toMatchObject({ description: "Placa Main LG Smart", productId: null, total: 104000.25 });
});
