import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";
const mock = vi.hoisted(() => ({ from: vi.fn(), history: vi.fn(), native: vi.fn(), selected: vi.fn(), linked: vi.fn(), eq: vi.fn(), limit: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mock.from, rpc: mock.rpc }) }));
import { getRepairs } from "./queries";

const native = { id: "00000000-0000-4000-8000-000000000123", repair_number: "REP-000123", intake_date: "2026-09-01", final_amount: 0, approved_amount: 80000, budget_amount: 70000, issue_reported: "No enciende", repair_access_customers: { full_name: "Cliente", phone: "123" }, repair_access_devices: { device_type: "TV" } };
const row = (id: string) => ({ id, customer_name: "Cliente", device: "TV", final_price: 80000, entry_date: "2026-09-01", created_at: "2026-09-01", financial_version: 4, repair_payments: [{ id: "payment", method: "nx", amount: 30000, payment_date: "2026-10-05" }] });

describe("bounded REP collection navigation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.history.mockResolvedValue({ data: [row("history-record")], count: 151, error: null });
    mock.native.mockResolvedValue({ data: native, error: null });
    mock.selected.mockResolvedValue({ data: row("00000000-0000-4000-8000-000000000555"), error: null });
    mock.linked.mockResolvedValue({ data: [{ ...row("outside-page"), repair_access_order_id: native.id, repair_access_orders: { repair_number: native.repair_number } }], error: null });
    mock.from.mockImplementation((table: string) => {
      const query: any = { select: () => query, order: () => query, range: mock.history, maybeSingle: table === "repairs" ? mock.selected : mock.native };
      query.eq = (column: string, value: unknown) => { mock.eq(table, column, value); return query; };
      query.limit = (count: number) => { mock.limit(table, count); return mock.linked(); };
      return query;
    });
  });

  it("selects the existing financial record by native ID even outside the requested history page", async () => {
    const data = await getRepairs(3, "rep 123");
    expect(data.items.map((repair) => repair.id)).toEqual(["history-record"]);
    expect(data.pagination).toEqual(createPaginationMeta(151, 3, DEFAULT_PAGE_SIZE));
    const range = getPaginationRange(3);
    expect(mock.history).toHaveBeenCalledExactlyOnceWith(range.from, range.to);
    expect(mock.eq).toHaveBeenCalledWith("repair_access_orders", "repair_number", "REP-000123");
    expect(mock.eq).toHaveBeenCalledWith("repairs", "repair_access_order_id", native.id);
    expect(mock.limit).toHaveBeenCalledWith("repairs", 2);
    expect(data.collectionTarget?.repair).toMatchObject({ id: "outside-page", repairAccessOrderId: native.id, paidTotal: 30000, balance: 50000, financialVersion: 4 });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("prepares only the current native price when no linked financial record exists", async () => {
    mock.linked.mockResolvedValue({ data: [], error: null });
    const data = await getRepairs(1, "123");
    expect(data.collectionTarget?.repair).toBeNull();
    expect(data.collectionTarget?.order).toMatchObject({ id: native.id, repairNumber: "REP-000123", amount: 80000, intakeDate: "2026-09-01" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on ambiguous linkage and does not perform a broad search for invalid links", async () => {
    mock.linked.mockResolvedValue({ data: [row("one"), row("two")], error: null });
    const ambiguous = await getRepairs(1, "REP-123");
    expect(ambiguous.collectionTarget?.error).toMatch(/varios|mas de un/i);
    expect(ambiguous.collectionTarget?.order).toBeNull();
    mock.eq.mockClear();
    const invalid = await getRepairs(1, "%bad*query");
    expect(invalid.collectionTarget?.error).toMatch(/numero|enlace/i);
    expect(mock.eq).not.toHaveBeenCalled();
  });

  it("restores an exact financial record after a payment redirect even outside the history page", async () => {
    const id = "00000000-0000-4000-8000-000000000555";
    const data = await getRepairs(3, undefined, id);
    expect(mock.eq).toHaveBeenCalledWith("repairs", "id", id);
    expect(data.collectionTarget?.repair).toMatchObject({ id, paidTotal: 30000, balance: 50000 });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid edit IDs without querying a record or silently preparing a duplicate", async () => {
    const data = await getRepairs(1, undefined, "not-a-uuid");
    expect(data.collectionTarget?.error).toMatch(/registro|enlace/i);
    expect(mock.eq).not.toHaveBeenCalled();
  });
});

describe("server-side repair payment history search", () => {
  let requests: { url: URL; headers: Headers }[];
  let responses: { data?: unknown; count?: number; error?: string }[];

  beforeEach(() => {
    vi.resetAllMocks();
    requests = [];
    responses = [{ data: [row("matching-history")], count: 26 }];
    const client = createClient("https://repairs.test", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
          const response = responses.shift();
          if (!response) throw new Error("Unexpected unbounded request");
          return new Response(JSON.stringify(response.error ? { message: response.error } : response.data), {
            status: response.error ? 400 : 200,
            headers: {
              "Content-Type": "application/json",
              ...(response.count !== undefined ? { "Content-Range": `0-0/${response.count}` } : {})
            }
          });
        }
      }
    });
    mock.from.mockImplementation((table: string) => client.from(table));
  });

  it("filters all matching history before exact count and pagination with stable chronology", async () => {
    const result = await getRepairs(2, undefined, undefined, "  Cliente  ");
    expect(requests).toHaveLength(1);
    const { searchParams: params, pathname } = requests[0].url;
    expect(pathname).toBe("/rest/v1/repairs");
    expect(params.get("or")).toBe('(customer_name.imatch."Cliente",device.imatch."Cliente",issue_description.imatch."Cliente",customer_phone.imatch."Cliente",order_number.imatch."Cliente",observations.imatch."Cliente",history_search.not.is.null)');
    expect(params.get("order")).toBe("created_at.desc,id.desc");
    expect(params.get("offset")).toBe("25");
    expect(params.get("limit")).toBe("25");
    expect(requests[0].headers.get("prefer")).toContain("count=exact");
    expect(result.pagination).toEqual(createPaginationMeta(26, 2, DEFAULT_PAGE_SIZE));
    expect(result.items.map((repair) => repair.id)).toEqual(["matching-history"]);
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("repairs");
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("searches linked REP, customer contact and equipment fields without restricting payment embeds", async () => {
    await getRepairs(1, undefined, undefined, "Sony");
    const params = requests[0].url.searchParams;
    expect(params.get("select")).toContain("history_search:repair_access_orders(id,search_customer:repair_access_customers(),search_device:repair_access_devices())");
    expect(params.get("select")).not.toContain("!inner");
    for (const field of ["repair_number", "legacy_order_number", "issue_reported", "technical_diagnosis", "budget_detail", "work_performed", "notes"]) {
      expect(params.get("history_search.or")).toContain(`${field}.imatch."Sony"`);
    }
    expect(params.get("history_search.or")).toContain("search_customer.not.is.null,search_device.not.is.null");
    for (const field of ["full_name", "phone", "alternate_phone", "phone_normalized", "alternate_phone_normalized", "dni", "email", "address"]) {
      expect(params.get("history_search.search_customer.or")).toContain(`${field}.imatch."Sony"`);
    }
    for (const field of ["device_type", "brand", "model", "serial_number"]) {
      expect(params.get("history_search.search_device.or")).toContain(`${field}.imatch."Sony"`);
    }
    expect([...params.keys()].filter((key) => key.includes("repair_payments") || key.includes("repair_access_payments"))).toEqual([]);
  });

  it("preserves the complete mapped ledger, including native payments and excluding voids and duplicates", async () => {
    responses = [{ data: [{
      ...row("matching-history"), repair_access_order_id: native.id, customer_phone: "555", order_number: "old-123", observations: "Original notes",
      repair_access_orders: { repair_number: native.repair_number, repair_access_payments: [
        { id: "native-payment", method: "mp", amount: "10000", payment_date: "2026-10-06", created_at: "2026-10-06" },
        { id: "duplicate", method: "nx", amount: 30000, legacy_repair_payment_id: "payment" },
        { id: "void", method: "mp", amount: 60000, voided_at: "2026-10-07" }
      ] }
    }], count: 1 }];
    const result = await getRepairs(1, undefined, undefined, "555");
    expect(result.items[0]).toMatchObject({
      id: "matching-history", repairAccessOrderId: native.id, repairAccessOrderNumber: native.repair_number,
      orderNumber: "old-123", customerPhone: "555", observations: "Original notes", financialVersion: 4,
      paidTotal: 40000, balance: 40000, payments: [
        expect.objectContaining({ id: "payment", amount: 30000, paymentDate: "2026-10-05" }),
        expect.objectContaining({ id: "native-payment", amount: 10000, paymentDate: "2026-10-06", source: "repair_access" })
      ]
    });
  });

  it.each([undefined, "", "   \t\n  "])("does not add filters or extra joins for an empty search (%j)", async (search) => {
    await getRepairs(1, undefined, undefined, search);
    const params = requests[0].url.searchParams;
    expect([...params.keys()].filter((key) => key === "or" || key.endsWith(".or"))).toEqual([]);
    expect(params.get("select")).not.toContain("history_search");
    expect(params.get("limit")).toBe("25");
  });

  it.each([
    { search: "%_*", literal: String.raw`%_\*` },
    { search: 'a,b).or(id.neq.0),"x"', literal: String.raw`a,b\)\.or\(id\.neq\.0\),"x"` },
    { search: String.raw`TV\[a-z]+(x)?^$|{2}.`, literal: String.raw`TV\\\[a-z\]\+\(x\)\?\^\$\|\{2\}\.` }
  ])("treats PostgREST and pattern syntax as literal text: $search", async ({ search, literal }) => {
    await getRepairs(1, undefined, undefined, search);
    const root = requests[0].url.searchParams.get("or");
    const quoted = JSON.stringify(literal);
    expect(root).toBe(`(customer_name.imatch.${quoted},device.imatch.${quoted},issue_description.imatch.${quoted},customer_phone.imatch.${quoted},order_number.imatch.${quoted},observations.imatch.${quoted},history_search.not.is.null)`);
    expect(new RegExp(literal, "i").test(search)).toBe(true);
    expect(new RegExp(literal, "i").test("unrelated history")).toBe(false);
  });

  it("bounds search input to 200 characters before escaping and strips null bytes", async () => {
    await getRepairs(1, undefined, undefined, `  ${"a".repeat(200)}\0INJECTED`);
    const filters = [...requests[0].url.searchParams.entries()].filter(([key]) => key === "or" || key.endsWith(".or"));
    for (const [, value] of filters) {
      expect(value).toContain(`imatch."${"a".repeat(200)}"`);
      expect(value).not.toContain("INJECTED");
      expect(value).not.toContain("\0");
    }
    expect(filters).toHaveLength(4);
  });

  it("keeps search, count, range and ordering in both existing schema fallbacks", async () => {
    responses = [
      { error: "Could not find a relationship for repair_access_orders" },
      { error: "column repairs.customer_phone does not exist" },
      { data: [row("legacy-match")], count: 27 }
    ];
    const result = await getRepairs(2, undefined, undefined, "TV");
    expect(requests).toHaveLength(3);
    const fallback = requests[1].url.searchParams;
    expect(fallback.get("select")).not.toContain("repair_access_orders");
    expect(fallback.get("or")).toContain('customer_phone.imatch."TV"');
    expect(fallback.get("or")).toContain('order_number.imatch."TV"');
    expect(fallback.get("or")).toContain('observations.imatch."TV"');
    expect(fallback.get("or")).not.toContain("history_search");
    const minimal = requests[2].url.searchParams;
    expect(minimal.get("or")).toBe('(customer_name.imatch."TV",device.imatch."TV",issue_description.imatch."TV")');
    expect(minimal.get("select")).not.toMatch(/customer_phone|order_number|observations|repair_access/);
    for (const { url, headers } of requests) {
      expect(url.searchParams.get("order")).toBe("created_at.desc,id.desc");
      expect(url.searchParams.get("offset")).toBe("25");
      expect(url.searchParams.get("limit")).toBe("25");
      expect(headers.get("prefer")).toContain("count=exact");
    }
    expect(result.pagination).toEqual(createPaginationMeta(27, 2, DEFAULT_PAGE_SIZE));
    expect(result.items[0]).toMatchObject({ id: "legacy-match", paidTotal: 30000, balance: 50000, customerPhone: "", repairAccessOrderId: null });
  });

  it("can fall back directly to the oldest schema without silently dropping search", async () => {
    responses = [{ error: "column repairs.order_number does not exist" }, { data: [], count: 0 }];
    const result = await getRepairs(1, undefined, undefined, "absent");
    expect(requests).toHaveLength(2);
    expect(requests[1].url.searchParams.get("or")).toBe('(customer_name.imatch."absent",device.imatch."absent",issue_description.imatch."absent")');
    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("still resolves an exact REP outside the searched history without adding search to the target", async () => {
    responses = [{ data: [], count: 0 }, { data: native }, { data: [{ ...row("outside-search"), repair_access_order_id: native.id }] }];
    const result = await getRepairs(1, "rep 123", undefined, "unrelated");
    expect(requests).toHaveLength(3);
    expect(requests[1].url.pathname).toBe("/rest/v1/repair_access_orders");
    expect(requests[1].url.searchParams.get("repair_number")).toBe("eq.REP-000123");
    expect(requests[2].url.searchParams.get("repair_access_order_id")).toBe(`eq.${native.id}`);
    expect(requests[2].url.searchParams.get("limit")).toBe("2");
    expect(requests.slice(1).every(({ url }) => !url.searchParams.has("or"))).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.collectionTarget?.repair?.id).toBe("outside-search");
  });

  it("gives an exact edit link precedence over REP and search, including outside the filtered page", async () => {
    const id = "00000000-0000-4000-8000-000000000555";
    responses = [{ data: [], count: 0 }, { data: row(id) }];
    const result = await getRepairs(1, "REP-000123", id, "unrelated");
    expect(requests).toHaveLength(2);
    expect(requests[1].url.searchParams.get("id")).toBe(`eq.${id}`);
    expect(requests[1].url.searchParams.has("or")).toBe(false);
    expect(result.collectionTarget?.repair).toMatchObject({ id, financialVersion: 4, paidTotal: 30000 });
  });

  it("does not retry unrelated errors with an unfiltered query", async () => {
    responses = [{ error: "permission denied for table repairs" }];
    await expect(getRepairs(1, undefined, undefined, "TV")).rejects.toThrow("permission denied");
    expect(requests).toHaveLength(1);
  });
});
