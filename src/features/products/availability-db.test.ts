import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalRestoreTarget } from "../../../scripts/backup-restore-local-core";
import { getProductAvailability } from "./availability";

const connectionString = process.env.PRODUCT_AVAILABILITY_TEST_DATABASE_URL;
const { Client } = createRequire(import.meta.url)("pg");
let db: any;
let product: { id: string; stock: number };
const rpcClient = {
  async rpc(_name: string, args: { p_product_ids: string[] }) {
    try {
      const result = await db.query("select public.get_workshop_product_availability($1::uuid[]) as payload", [args.p_product_ids]);
      return { data: result.rows[0].payload, error: null };
    } catch (error: any) { return { data: null, error: { code: error.code, message: "Read-only availability RPC failed" } }; }
  }
};

describe.runIf(Boolean(connectionString))("restored local availability RPC (read-only)", () => {
  beforeEach(async () => {
    assertLocalRestoreTarget(connectionString!);
    db = new Client({ connectionString });
    await db.connect();
    await db.query("begin isolation level repeatable read read only");
    const admin = await db.query("select id from public.profiles where role='admin' order by id limit 1");
    const products = await db.query("select id,stock from public.products order by id limit 1");
    if (!admin.rows.length || !products.rows.length) throw new Error("Local availability fixture needs restored admin and product rows");
    product = products.rows[0];
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [admin.rows[0].id, JSON.stringify({ sub: admin.rows[0].id, role: "authenticated" })]);
  });
  afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); db = undefined; } });
  it("returns database-derived reserved/free quantities while physical stock remains unchanged", async () => {
    const expected = await db.query("select coalesce(sum(reserved_quantity),0)::integer reserved from public.repair_part_requests where product_id=$1", [product.id]);
    const result = await getProductAvailability(rpcClient, [product.id]);
    expect(result.status).toBe("ready");
    const actual = result.values.get(product.id);
    const reserved = expected.rows[0].reserved;
    expect(Boolean(actual && actual.reserved === reserved && actual.available === Math.max(0, product.stock - reserved))).toBe(true);
    const unchanged = await db.query("select stock from public.products where id=$1", [product.id]);
    expect(unchanged.rows[0].stock === product.stock).toBe(true);
  });
  it("honors the operations guard with no authenticated identity", async () => {
    await db.query("select set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claims','{}',true)");
    const result = await getProductAvailability(rpcClient, [product.id]);
    expect(result.status).toBe("unavailable");
    expect(result.values.size).toBe(0);
  });
});
