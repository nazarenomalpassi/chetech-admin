import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";

async function rpc(db: Database, sql: string, args: unknown[], actor: string = IDENTITIES[0].id) {
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: actor, role: "authenticated" }), actor]);
    await db.query("set local role authenticated");
    const { rows } = await db.query(sql, args);
    await db.query("commit"); return rows[0].result;
  } catch (e) { await db.query("rollback"); throw e; }
}
async function main() {
  const owner = await connectDatabase(), a = await connectDatabase(), b = await connectDatabase();
  const customer = randomUUID(), device = randomUUID(), order = randomUUID();
  const start = "select public.workshop_warranty_start($1,$2,$3,(now() at time zone 'America/Argentina/Buenos_Aires')::date,'CONCURRENCY-WARRANTY synthetic','','',true) result";
  const save = "select public.workshop_warranty_save($1,$2,$3,$4,$5,'','') result";
  try {
    await owner.query("insert into public.repair_access_customers(id,full_name) values($1,'CONCURRENCY-WARRANTY synthetic')", [customer]);
    await owner.query("insert into public.repair_access_devices(id,customer_id,device_type) values($1,$2,'Synthetic TV')", [device, customer]);
    await owner.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,status,picked_up_at,delivered_at) values($1,$2,$3,'CONCURRENCY-WARRANTY synthetic','retirado',now(),now())", [order, customer, device]);
    const version = (await owner.query("select workflow_version v from public.repair_access_orders where id=$1", [order])).rows[0].v;
    const op = randomUUID();
    const results = await Promise.all([rpc(a, start, [order, version, op]), rpc(b, start, [order, version, op])]);
    assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true]);
    assert.equal(results[0].id, results[1].id);
    assert.equal((await owner.query("select count(*)::int n from public.repair_warranty_returns where order_id=$1", [order])).rows[0].n, 1);
    const id = results[0].id;
    const updates = await Promise.allSettled([
      rpc(a, save, [id, 1, randomUUID(), "en_revision", "First draft"]),
      rpc(b, save, [id, 1, randomUUID(), "en_revision", "Second draft"])
    ]);
    assert.equal(updates.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((updates.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code, "40001");
    const retry = randomUUID();
    const same = await Promise.all([
      rpc(a, save, [id, 2, retry, "no_presenta_fallas", "Tested"]),
      rpc(b, save, [id, 2, retry, "no_presenta_fallas", "Tested"])
    ]);
    assert.deepEqual(same.map((r) => r.replayed).sort(), [false, true]);
    assert.ok(same.every((r) => r.version === 3));
    await assert.rejects(rpc(a, save, [id, 2, retry, "no_presenta_fallas", "Tested"], IDENTITIES[1].id), (e: any) => e.code === "23514");
    const starts = await Promise.allSettled([rpc(a, start, [order, version, randomUUID()]), rpc(b, start, [order, version, randomUUID()])]);
    assert.ok(starts.every((r) => r.status === "rejected" && r.reason.code === "23514"));
    console.log("PASS concurrent warranty intake retries, unique active case, stale writer protection, update replay and actor isolation");
  } finally {
    await a.end(); await b.end();
    await owner.query("begin");
    try {
      const ids = (await owner.query("select id::text from public.repair_warranty_returns where order_id=$1", [order])).rows.map((r) => r.id);
      await owner.query("delete from private.workshop_warranty_receipts where request_fingerprint->>'order'=$1 or request_fingerprint->>'return'=any($2::text[])", [order, ids]);
      await owner.query("delete from public.audit_logs where (entity_type='repair_warranty_returns' and entity_id=any($1::text[])) or (entity_type='repair_access_orders' and entity_id=$2)", [ids, order]);
      await owner.query("delete from public.repair_warranty_returns where order_id=$1", [order]);
      await owner.query("delete from public.workshop_events where order_id=$1", [order]);
      await owner.query("delete from public.repair_access_orders where id=$1", [order]);
      await owner.query("delete from public.repair_access_devices where id=$1", [device]);
      await owner.query("delete from public.repair_access_customers where id=$1", [customer]);
      await owner.query("commit");
    } catch (e) { await owner.query("rollback"); throw e; }
    finally { await owner.end(); }
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
