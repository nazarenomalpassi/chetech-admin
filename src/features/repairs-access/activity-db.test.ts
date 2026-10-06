import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalRestoreTarget } from "../../../scripts/backup-restore-local-core";

const connectionString = process.env.REPAIR_ACTIVITY_TEST_DATABASE_URL;
const { Client } = createRequire(import.meta.url)("pg");
let db: any;
let orderId: string;
let actorId: string;
let fixtureIds: string[];
const date = "2099-10-05T12:00:00.123456+00:00";
async function withSavepoint(run: () => Promise<void>) {
  await db.query("savepoint activity_check");
  try { await run(); } finally { await db.query("rollback to savepoint activity_check"); }
}

describe.runIf(Boolean(connectionString))("local activity RPC transaction fixtures", () => {
  beforeAll(async () => {
    assertLocalRestoreTarget(connectionString!);
    db = new Client({ connectionString });
    await db.connect();
    await db.query("begin");
    const migration = readFileSync(new URL("../../../supabase/migrations/20261005211725_workshop_activity_read_page.sql", import.meta.url), "utf8");
    await db.query(migration.replace(/^\s*begin;/i, "").replace(/commit;\s*$/i, ""));
    const orders = await db.query("select id from public.repair_access_orders order by id limit 1");
    const actors = await db.query("select id from public.profiles where role='admin' order by id limit 1");
    if (!orders.rows.length || !actors.rows.length) throw new Error("Local activity test needs restored order/admin fixtures");
    orderId = orders.rows[0].id;
    actorId = actors.rows[0].id;
    fixtureIds = Array.from({ length: 71 }, (_, index) => `99999999-9999-4999-8999-${String(71 - index).padStart(12, "0")}`);
    await db.query("insert into public.workshop_events(id,order_id,kind,message,actor_id,created_at) select id,$1,'update','Synthetic operational activity',$2,$3 from unnest($4::uuid[]) id", [orderId, actorId, date, fixtureIds]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actorId]);
    await db.query("set local role authenticated");
  });
  afterAll(async () => { if (db) { await db.query("rollback"); await db.end(); } });

  it("walks every same-timestamp fixture with stable oldest date/ID cursors and no financial/audit payload", async () => {
    const seen: string[] = [];
    let cursor: { date: string; id: string } | null = null;
    for (let page = 0; page < 4 && seen.length < 71; page++) {
      const result: any = await db.query("select public.get_workshop_activity_page($1,$2,$3,$4) payload", [orderId, cursor?.date ?? null, cursor?.id ?? null, page ? 30 : 20]);
      const payload: any = result.rows[0].payload;
      expect(payload.events.length <= (page ? 30 : 20)).toBe(true);
      for (const event of payload.events) {
        expect(Object.keys(event).sort()).toEqual(["actorName", "createdAt", "id", "kind", "message"]);
        expect(typeof event.actorName).toBe("string");
        if (fixtureIds.includes(event.id)) seen.push(event.id);
      }
      cursor = payload.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(fixtureIds);
    expect(new Set(seen).size).toBe(71);
  });
  it("caps direct calls at 30 and keeps public invoker/private definer grants", async () => {
    const result = await db.query("select public.get_workshop_activity_page($1,null,null,999) payload", [orderId]);
    expect(result.rows[0].payload.events).toHaveLength(30);
    const signatures = await db.query("select n.nspname,p.prosecdef,has_function_privilege('anon',p.oid,'execute') anon_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_workshop_activity_page' order by n.nspname");
    expect(signatures.rows).toEqual([{ nspname: "private", prosecdef: true, anon_execute: false }, { nspname: "public", prosecdef: false, anon_execute: false }]);
  });
  it("blocks missing orders rather than returning an empty history", async () => {
    await withSavepoint(async () => {
      await expect(db.query("select public.get_workshop_activity_page($1)", ["00000000-0000-4000-8000-000000000000"])).rejects.toMatchObject({ code: "P0002" });
    });
  });
  it("blocks a caller without an operations identity", async () => {
    await withSavepoint(async () => {
      await db.query("select set_config('request.jwt.claim.sub','',true)");
      await expect(db.query("select public.get_workshop_activity_page($1)", [orderId])).rejects.toMatchObject({ code: "42501" });
    });
  });
});
