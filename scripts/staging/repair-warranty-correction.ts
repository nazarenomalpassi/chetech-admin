import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";

async function asUser(db: Database, actor: string, sql: string, args: unknown[]) {
  await db.query("savepoint operation");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [actor, JSON.stringify({ sub: actor, role: "authenticated" })]);
    await db.query("set local role authenticated");
    const result = (await db.query(sql, args)).rows[0].result;
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true)");
    await db.query("release savepoint operation");
    return result;
  } catch (error) { await db.query("rollback to savepoint operation"); throw error; }
}

async function main() {
  // connectDatabase refuses remote URLs, remote Docker and non-staging databases.
  const db = await connectDatabase();
  await db.query("begin");
  try {
    const aclBefore = (await db.query("select oid::regprocedure::text name,proacl::text acl from pg_proc where oid in ('private.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text)'::regprocedure,'private.workshop_decide(uuid,integer,uuid,text,text,text)'::regprocedure) order by 1")).rows;
    if (process.argv.includes("--apply")) {
      const folder = new URL("../../supabase/migrations/", import.meta.url);
      const files = readdirSync(folder).filter((name) => name.endsWith("_repair_warranty_correction.sql"));
      assert.equal(files.length, 1);
      const sql = readFileSync(new URL(files[0], folder), "utf8").replace(/^\s*begin;/i, "").replace(/commit;\s*$/i, "");
      const installed = (await db.query("select to_regprocedure('public.workshop_warranty_correct(uuid,integer,uuid,boolean,integer,text,text,boolean)') installed")).rows[0].installed;
      if (!installed) await db.query(sql);
    }
    const aclAfter = (await db.query("select oid::regprocedure::text name,proacl::text acl from pg_proc where oid in ('private.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text)'::regprocedure,'private.workshop_decide(uuid,integer,uuid,text,text,text)'::regprocedure) order by 1")).rows;
    assert.deepEqual(aclAfter, aclBefore);
    const [admin, tech] = IDENTITIES.map((i) => i.id);
    const customer = randomUUID(), device = randomUUID(), order = randomUUID(), open = randomUUID(), expired = randomUUID(), debt = randomUUID();
    await db.query("insert into public.repair_access_customers(id,full_name) values($1,'WARRANTY-CORRECTION synthetic')", [customer]);
    await db.query("insert into public.repair_access_devices(id,customer_id,device_type) values($1,$2,'Synthetic TV')", [device, customer]);
    for (const id of [order, open, expired, debt]) await db.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported) values($1,$2,$3,'Original synthetic fault')", [id, customer, device]);
    await db.query("update public.repair_access_orders set status='retirado',picked_up_at=now()-interval '2 days',delivered_at=now()-interval '2 days',has_warranty=false,budget_amount=100,final_amount=100,budgeted_at=now()-interval '3 days',is_paid=true,paid_at=now()-interval '2 days' where id=$1", [order]);
    await db.query("insert into public.repair_access_payments(repair_order_id,method,amount,created_by) values($1,'efectivo',100,$2)", [order, admin]);
    const legacy = randomUUID();
    await db.query("insert into public.repairs(id,repair_access_order_id,customer_name,device,issue_description,final_price) values($1,$2,'WARRANTY-CORRECTION synthetic','TV','Original synthetic fault',100)", [legacy, order]);
    await db.query("insert into public.repair_payments(repair_id,method,amount) values($1,'nx',100)", [legacy]);
    const snapshot = async () => (await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [order])).rows[0].data;
    const before = await snapshot();
    const payments = (await db.query("select to_jsonb(p) data from public.repair_access_payments p where repair_order_id=$1", [order])).rows;
    const ledgerSnapshot = async () => (await db.query("select jsonb_build_object('repair',(select to_jsonb(r) from public.repairs r where id=$1),'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.repair_payments p where repair_id=$1)) data", [legacy])).rows[0].data;
    const ledger = await ledgerSnapshot();
    const sql = "select public.workshop_warranty_correct($1,$2,$3,$4,$5,$6,$7,$8) result";
    const args = [order, before.workflow_version, randomUUID(), true, 30, "Fuente original", "Garantia omitida en ficha", true];
    await assert.rejects(asUser(db, tech, sql, args), (e: any) => e.code === "42501");
    await assert.rejects(asUser(db, admin, sql, [...args.slice(0, 7), false]), (e: any) => e.code === "23514");
    const result = await asUser(db, admin, sql, args);
    assert.equal(result.version, before.workflow_version + 1);
    assert.equal((await asUser(db, admin, sql, args)).replayed, true);
    await assert.rejects(asUser(db, admin, sql, [...args.slice(0, 4), 60, ...args.slice(5)]), (e: any) => e.code === "23514");
    await assert.rejects(asUser(db, admin, sql, [order, before.workflow_version, randomUUID(), ...args.slice(3)]), (e: any) => e.code === "40001");
    const after = await snapshot();
    for (const key of Object.keys(before).filter((key) => !['has_warranty','warranty_days','warranty_conditions','warranty_start','warranty_until','warranty_active','warranty_requires_review','workflow_version','updated_by','updated_at'].includes(key))) assert.deepEqual(after[key], before[key], key);
    assert.equal((await db.query("select warranty_start=(picked_up_at at time zone 'America/Argentina/Buenos_Aires')::date and warranty_until=warranty_start+30 ok from public.repair_access_orders where id=$1", [order])).rows[0].ok, true);
    assert.equal((await db.query("select count(*)::int n from public.audit_logs where entity_id=$1 and changes->>'operation'='warranty_correction'", [order])).rows[0].n, 1);
    const today = (await db.query("select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d")).rows[0].d;
    await asUser(db, admin, "select public.workshop_warranty_start($1,$2,$3,$4::date,'Volvio a apagarse','','',false) result", [order, after.workflow_version, randomUUID(), today]);
    assert.deepEqual(await snapshot(), after);
    assert.deepEqual((await db.query("select to_jsonb(p) data from public.repair_access_payments p where repair_order_id=$1", [order])).rows, payments);
    assert.deepEqual(await ledgerSnapshot(), ledger);
    await assert.rejects(asUser(db, admin, "select public.workshop_save($1,$2,'{\"status\":\"en_revision\"}'::jsonb) result", [order, after.workflow_version]), (e: any) => e.code === "23514");
    await db.query("update public.repair_access_orders set status='retirado',picked_up_at=now()-interval '90 days',delivered_at=now()-interval '90 days',has_warranty=false where id=$1", [expired]);
    const expiredVersion = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [expired])).rows[0].v;
    await asUser(db, admin, sql, [expired, expiredVersion, randomUUID(), true, 30, "", "Garantia original omitida", true]);
    assert.equal((await db.query("select warranty_until<(now() at time zone 'America/Argentina/Buenos_Aires')::date and not warranty_active ok from public.repair_access_orders where id=$1", [expired])).rows[0].ok, true);
    const v = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [open])).rows[0].v;
    const quick = "select public.workshop_save_quick($1,$2,$3,$4::jsonb,$5,$6,$7) result";
    await assert.rejects(asUser(db, admin, quick, [order, after.workflow_version, randomUUID(), JSON.stringify({ has_warranty: true, warranty_days: 365 }), false, "", ""]), (e: any) => e.code === "23514");
    const accepted = await asUser(db, admin, quick, [open, v, randomUUID(), JSON.stringify({ status: "presupuestado", budget_amount: 100, budget_detail: "Fuente", has_warranty: true, warranty_days: 90, warranty_conditions: "Fuente" }), true, "registro", ""]);
    await asUser(db, admin, quick, [open, accepted.version, randomUUID(), JSON.stringify({ repair_progress: "Probado", has_warranty: true, warranty_days: 90 }), false, "", ""]);
    const acceptedOrder = (await db.query("select approval_status,has_warranty,warranty_start from public.repair_access_orders where id=$1", [open])).rows[0];
    assert.equal(acceptedOrder.approval_status, "accepted"); assert.equal(acceptedOrder.has_warranty, true); assert.equal(acceptedOrder.warranty_start, null);
    assert.equal((await db.query("select count(*)::int n from public.repair_customer_decisions where order_id=$1 and decision='accepted' and channel='registro'", [open])).rows[0].n, 1);
    await assert.rejects(asUser(db, admin, quick, [open, accepted.version, randomUUID(), JSON.stringify({ has_warranty: false, warranty_days: 0 }), false, "", ""]), (e: any) => e.code === "40001");
    const currentVersion = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [open])).rows[0].v;
    await asUser(db, admin, quick, [open, currentVersion, randomUUID(), JSON.stringify({ budget_amount: 200 }), false, "", ""]);
    assert.equal((await db.query("select approval_status from public.repair_access_orders where id=$1", [open])).rows[0].approval_status, "pending");
    await db.query("update public.repair_access_orders set status='no_presenta_fallas',budget_amount=500,final_amount=500,budgeted_at=now() where id=$1", [debt]);
    const debtVersion = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [debt])).rows[0].v;
    const noFault = await asUser(db, admin, quick, [debt, debtVersion, randomUUID(), JSON.stringify({ status: "no_presenta_fallas", budget_amount: 0, has_warranty: true, warranty_days: 90 }), false, "", ""]);
    const protectedOrder = (await db.query("select budget_amount,has_warranty from public.repair_access_orders where id=$1", [debt])).rows[0];
    assert.equal(Number(protectedOrder.budget_amount), 500); assert.equal(protectedOrder.has_warranty, false);
    await assert.rejects(asUser(db, admin, "select public.workshop_deliver($1,$2,'Cliente','',false) result", [debt, noFault.version]), (e: any) => e.code === "23514");
    const acl = (await db.query("select p.prosecdef,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p where p.oid='private.workshop_warranty_correct(uuid,integer,uuid,boolean,integer,text,text,boolean)'::regprocedure")).rows[0];
    assert.equal(acl.prosecdef, true); assert.equal(acl.anon, false);
    console.log("PASS correction ACLs, consent, version, audit, original delivery/payments, same REP return and quick warranty/approval");
  } finally { await db.query("rollback"); await db.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
