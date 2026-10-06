import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";

// This harness refuses anything except the isolated local PostgreSQL container.
async function submit(db: Database, orderId: string, version: number, operationId: string, note: string, actor: string = IDENTITIES[0].id, confirm = false) {
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",
      [JSON.stringify({ sub: actor, role: "authenticated" }), actor]);
    await db.query("set local role authenticated");
    const payload = confirm ? { status: "listo_para_retirar", budget_amount: 100, budget_detail: "Synthetic approved scope", quality_checked: true, repair_progress: note } : { repair_progress: note };
    const result = await db.query("select public.workshop_save_quick($1,$2,$3,$4::jsonb,$5,$6,$7) result",
      [orderId, version, operationId, JSON.stringify(payload), confirm, confirm ? "presencial" : "", confirm ? "Synthetic explicit authorization" : ""]);
    await db.query("commit");
    return result.rows[0].result;
  } catch (error) { await db.query("rollback"); throw error; }
}

async function main() {
  const owner = await connectDatabase(), a = await connectDatabase(), b = await connectDatabase();
  const customer = randomUUID(), device = randomUUID(), orders = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  try {
    await owner.query("insert into public.repair_access_customers(id,full_name) values($1,'CONCURRENCY-LOCAL synthetic')", [customer]);
    await owner.query("insert into public.repair_access_devices(id,customer_id,device_type) values($1,$2,'Synthetic TV')", [device, customer]);
    for (const id of orders) await owner.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported) values($1,$2,$3,'CONCURRENCY-LOCAL synthetic')", [id, customer, device]);
    const op = randomUUID();
    const retries = await Promise.all([
      submit(a, orders[0], 1, op, "One operation"), submit(b, orders[0], 1, op, "One operation")
    ]);
    assert.deepEqual(retries.map((r) => r.replayed).sort(), [false, true]);
    assert.ok(retries.every((r) => r.version === 2));
    assert.equal((await owner.query("select count(*)::integer n from private.workshop_quick_save_receipts where operation_id=$1", [op])).rows[0].n, 1);
    console.log("PASS simultaneous identical retry executes once");

    const approvalOp = randomUUID();
    const approvals = await Promise.all([
      submit(a, orders[3], 1, approvalOp, "Tested", IDENTITIES[0].id, true),
      submit(b, orders[3], 1, approvalOp, "Tested", IDENTITIES[0].id, true)
    ]);
    assert.deepEqual(approvals.map((r) => r.replayed).sort(), [false, true]);
    assert.equal(approvals[0].version, approvals[1].version);
    const approved = (await owner.query("select status,approval_status,quality_checked_at,is_paid,delivered_at,workflow_version from public.repair_access_orders where id=$1", [orders[3]])).rows[0];
    assert.equal(approved.status, "listo_para_retirar"); assert.equal(approved.approval_status, "accepted");
    assert.ok(approved.quality_checked_at); assert.equal(approved.is_paid, false); assert.equal(approved.delivered_at, null);
    assert.equal(approved.workflow_version, approvals[0].version);
    assert.equal((await owner.query("select count(*)::integer n from public.repair_customer_decisions where order_id=$1", [orders[3]])).rows[0].n, 1);
    console.log("PASS simultaneous combined approval/QC/readiness retry has one decision and no financial effect");

    const cross = randomUUID();
    const crossResults = await Promise.allSettled([
      submit(a, orders[1], 1, cross, "Cross-order operation"), submit(b, orders[2], 1, cross, "Cross-order operation")
    ]);
    assert.equal(crossResults.filter((r) => r.status === "fulfilled").length, 1);
    const crossError = crossResults.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.equal(crossError.reason.code, "23514");
    assert.equal((await owner.query("select count(*)::integer n from private.workshop_quick_save_receipts where operation_id=$1", [cross])).rows[0].n, 1);
    console.log("PASS simultaneous cross-order token collision rejects the other request");

    const version = (await owner.query("select workflow_version v from public.repair_access_orders where id=$1", [orders[0]])).rows[0].v;
    const races = await Promise.allSettled([
      submit(a, orders[0], version, randomUUID(), "First writer"), submit(b, orders[0], version, randomUUID(), "Second writer")
    ]);
    assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
    const raceError = races.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.equal(raceError.reason.code, "40001");
    assert.equal((await owner.query("select workflow_version v from public.repair_access_orders where id=$1", [orders[0]])).rows[0].v, version + 1);
    console.log("PASS simultaneous distinct operations preserve optimistic concurrency");
    await assert.rejects(submit(a, orders[0], 1, op, "One operation", IDENTITIES[1].id), (error: any) => error.code === "23514");
    console.log("PASS another actor cannot replay the saved operation");
  } finally {
    await a.end(); await b.end();
    await owner.query("begin");
    try {
      await owner.query("delete from private.workshop_quick_save_receipts where order_id=any($1::uuid[])", [orders]);
      for (const table of ["repair_customer_decisions", "workshop_tasks", "workshop_events", "repair_budget_versions"]) {
        await owner.query(`delete from public.${table} where order_id=any($1::uuid[])`, [orders]);
      }
      await owner.query("delete from public.repair_access_orders where id=any($1::uuid[])", [orders]);
      await owner.query("delete from public.repair_access_devices where id=$1", [device]);
      await owner.query("delete from public.repair_access_customers where id=$1", [customer]);
      await owner.query("commit");
    } catch (error) { await owner.query("rollback"); throw error; }
    finally { await owner.end(); }
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Local concurrency verification failed"); process.exitCode = 1; });
