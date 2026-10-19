import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";

async function asUser(db: Database, actor: string, sql: string, args: unknown[] = []) {
  await db.query("savepoint operation");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: actor, role: "authenticated" }), actor]);
    await db.query("set local role authenticated");
    const r = await db.query(sql, args);
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true)");
    await db.query("release savepoint operation");
    return r.rows[0]?.result;
  } catch (e) { await db.query("rollback to savepoint operation"); throw e; }
}
async function main() {
  const db = await connectDatabase();
  if (process.argv.includes("--apply")) {
    await db.query(readFileSync(new URL("../../supabase/migrations/20261019160949_workshop_warranty_returns.sql", import.meta.url), "utf8"));
  }
  if (process.argv.includes("--refresh-functions")) {
    const sql = readFileSync(new URL("../../supabase/migrations/20261019160949_workshop_warranty_returns.sql", import.meta.url), "utf8");
    for (const [definition] of sql.matchAll(/create (?:or replace )?function [\s\S]+?\$\$;/g)) {
      await db.query(definition.replace(/^create function/, "create or replace function"));
    }
    const patch = sql.slice(sql.indexOf("do $patch$"), sql.indexOf("$patch$;", sql.indexOf("do $patch$")) + "$patch$;".length);
    await db.query(patch);
    await db.query(sql.slice(sql.indexOf("-- Preserve the current search/privacy"), sql.indexOf("notify pgrst")));
  }
  const admin = IDENTITIES[0].id, tech = IDENTITIES[1].id;
  const customer = randomUUID(), device = randomUUID(), order = randomUUID(), noFault = randomUUID(), debt = randomUUID();
  await db.query("begin");
  try {
    await db.query("insert into public.repair_access_customers(id,full_name) values($1,'WARRANTY-LOCAL synthetic')", [customer]);
    await db.query("insert into public.repair_access_devices(id,customer_id,device_type) values($1,$2,'Synthetic TV')", [device, customer]);
    for (const id of [order, noFault, debt]) await db.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported) values($1,$2,$3,'Original synthetic issue')", [id, customer, device]);
    await db.query("update public.repair_access_orders set status='retirado',picked_up_at=now()-interval '2 days',delivered_at=now()-interval '2 days',budget_amount=100,final_amount=100,budgeted_at=now()-interval '3 days',is_paid=true,paid_at=now()-interval '2 days',payment_method='efectivo',has_warranty=true,warranty_days=30 where id=$1", [order]);
    const legacyRepair = randomUUID();
    await db.query("insert into public.repairs(id,repair_access_order_id,customer_name,device,issue_description,final_price) values($1,$2,'WARRANTY-LOCAL synthetic','TV','Original synthetic issue',100)", [legacyRepair, order]);
    await db.query("insert into public.repair_payments(repair_id,method,amount) values($1,'nx',60)", [legacyRepair]);
    await db.query("insert into public.repair_access_payments(repair_order_id,method,amount,created_by) values($1,'efectivo',40,$2)", [order, admin]);
    const original = (await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [order])).rows[0].data;
    const paymentSql = "select jsonb_build_object('native',(select jsonb_agg(to_jsonb(p) order by id) from public.repair_access_payments p where repair_order_id=$1),'legacy',(select jsonb_agg(to_jsonb(p) order by id) from public.repair_payments p where repair_id=$2),'financialRepair',(select to_jsonb(r) from public.repairs r where id=$2)) data";
    const paymentsBefore = (await db.query(paymentSql, [order, legacyRepair])).rows[0].data;
    const today = (await db.query("select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d")).rows[0].d;
    const op = randomUUID();
    const startSql = "select public.workshop_warranty_start($1,$2,$3,$4::date,$5,$6,$7,$8) result";
    const startArgs = [order, original.workflow_version, op, today, "Se apaga nuevamente", "Control remoto", "Sin golpes", false];
    const first = await asUser(db, admin, startSql, startArgs);
    assert.equal(first.version, 1); assert.equal(first.replayed, false);
    assert.equal((await asUser(db, admin, startSql, startArgs)).replayed, true);
    await assert.rejects(asUser(db, admin, startSql, [...startArgs.slice(0, 2), randomUUID(), ...startArgs.slice(3)]), (e: any) => e.code === "23514");
    await assert.rejects(asUser(db, tech, startSql, startArgs), (e: any) => e.code === "42501");
    assert.deepEqual((await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [order])).rows[0].data, original);
    assert.deepEqual((await db.query(paymentSql, [order, legacyRepair])).rows[0].data, paymentsBefore);
    console.log("PASS same REP, immutable original order, one active return and idempotent intake");

    const saveSql = "select public.workshop_warranty_save($1,$2,$3,$4,$5,$6,$7) result";
    await assert.rejects(asUser(db, admin, saveSql, [first.id, 1, randomUUID(), "retirado", "", "", "Cliente"]), (e: any) => e.code === "23514");
    const updateOp = randomUUID();
    const saved = await asUser(db, tech, saveSql, [first.id, 1, updateOp, "no_presenta_fallas", "Probado encendido", "No se reprodujo la falla", ""]);
    assert.equal(saved.version, 2);
    assert.equal((await asUser(db, tech, saveSql, [first.id, 1, updateOp, "no_presenta_fallas", "Probado encendido", "No se reprodujo la falla", ""])).replayed, true);
    await assert.rejects(asUser(db, tech, saveSql, [first.id, 1, randomUUID(), "en_revision", "Stale draft", "", ""]), (e: any) => e.code === "40001");
    await assert.rejects(asUser(db, tech, saveSql, [first.id, 2, randomUUID(), "retirado", "", "", "Cliente"]), (e: any) => e.code === "42501");
    const read = await asUser(db, tech, "select public.workshop_warranty_read(p_order_ids=>$1::uuid[]) result", [[order]]);
    assert.equal(read.items[0].id, first.id); assert.equal(read.items[0].issueReported, "Se apaga nuevamente");
    const closed = await asUser(db, admin, saveSql, [first.id, 2, randomUUID(), "retirado", "Probado encendido", "No se reprodujo la falla", "Cliente sintetico"]);
    assert.equal(closed.version, 3);
    await assert.rejects(asUser(db, admin, saveSql, [first.id, 3, randomUUID(), "en_revision", "", "", ""]), (e: any) => e.code === "23514");
    const second = await asUser(db, admin, startSql, [...startArgs.slice(0, 2), randomUUID(), ...startArgs.slice(3)]);
    assert.notEqual(second.id, first.id);
    assert.deepEqual((await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [order])).rows[0].data, original);
    assert.deepEqual((await db.query(paymentSql, [order, legacyRepair])).rows[0].data, paymentsBefore);
    assert.equal((await db.query("select count(*)::int n from public.repair_access_orders where id=$1", [order])).rows[0].n, 1);
    console.log("PASS technician review, stale rejection, guarded return pickup and repeated warranty visits without financial changes");

    await db.query("update public.repair_access_orders set budget_amount=null,final_amount=null where id=$1", [noFault]);
    const noFaultBefore = (await db.query("select workflow_version,budget_revision from public.repair_access_orders where id=$1", [noFault])).rows[0];
    const noFaultSave = await asUser(db, tech, "select public.workshop_save_quick($1,$2,$3,$4::jsonb,false,'','') result", [noFault, noFaultBefore.workflow_version, randomUUID(), JSON.stringify({ status: "no_presenta_fallas" })]);
    assert.equal(noFaultSave.status, "no_presenta_fallas");
    await asUser(db, admin, "select public.workshop_deliver($1,$2,'Cliente sintetico','',false) result", [noFault, noFaultSave.version]);
    const nf = (await db.query("select status,budget_amount,final_amount,budget_revision,is_paid from public.repair_access_orders where id=$1", [noFault])).rows[0];
    assert.equal(nf.status, "retirado"); assert.equal(nf.is_paid, false);
    assert.equal(nf.budget_amount, null); assert.equal(nf.final_amount, null); assert.equal(nf.budget_revision, noFaultBefore.budget_revision);
    await db.query("update public.repair_access_orders set budget_amount=500,final_amount=500,budgeted_at=now(),status='no_presenta_fallas' where id=$1", [debt]);
    let debtVersion = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [debt])).rows[0].v;
    await asUser(db, admin, "select public.workshop_save($1,$2,$3::jsonb) result", [debt, debtVersion, JSON.stringify({ status: "no_presenta_fallas", budget_amount: 0, budget_detail: "Stale form", final_amount: 0 })]);
    let money = (await db.query("select budget_amount,final_amount,workflow_version from public.repair_access_orders where id=$1", [debt])).rows[0];
    assert.equal(Number(money.budget_amount), 500); assert.equal(Number(money.final_amount), 500);
    for (const status of [undefined, ""]) {
      const payload = { ...(status !== undefined ? { status } : {}), budget_amount: 0, final_amount: 0 };
      await asUser(db, admin, "select public.workshop_save($1,$2,$3::jsonb) result", [debt, money.workflow_version, JSON.stringify(payload)]);
      money = (await db.query("select budget_amount,final_amount,workflow_version from public.repair_access_orders where id=$1", [debt])).rows[0];
      assert.equal(Number(money.budget_amount), 500); assert.equal(Number(money.final_amount), 500);
      delete (payload as Record<string, unknown>).final_amount;
      await asUser(db, tech, "select public.workshop_save_quick($1,$2,$3,$4::jsonb,false,'','') result", [debt, money.workflow_version, randomUUID(), JSON.stringify(payload)]);
      money = (await db.query("select budget_amount,final_amount,workflow_version from public.repair_access_orders where id=$1", [debt])).rows[0];
      assert.equal(Number(money.budget_amount), 500); assert.equal(Number(money.final_amount), 500);
    }
    await asUser(db, tech, "select public.workshop_save_quick($1,$2,$3,$4::jsonb,true,'presencial','') result", [debt, money.workflow_version, randomUUID(), JSON.stringify({ status: "no_presenta_fallas", budget_amount: 0 })]);
    await asUser(db, tech, "select public.update_technician_repair_workshop($1,'no_presenta_fallas',0,'Stale quote','Tested') result", [debt]);
    money = (await db.query("select budget_amount,final_amount,workflow_version from public.repair_access_orders where id=$1", [debt])).rows[0];
    assert.equal(Number(money.budget_amount), 500); assert.equal(Number(money.final_amount), 500);
    await db.query("update public.repair_access_orders set final_amount=0 where id=$1", [debt]);
    debtVersion = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [debt])).rows[0].v;
    await assert.rejects(asUser(db, admin, "select public.workshop_deliver($1,$2,'Cliente sintetico','',false) result", [debt, debtVersion]), (e: any) => e.code === "23514");
    await asUser(db, admin, "select public.workshop_deliver($1,$2,'Cliente sintetico','Saldo autorizado pendiente',true) result", [debt, debtVersion]);
    console.log("PASS no-fault saved and delivered without quote; positive unpaid amount is not silently waived");

    const nfVersion = (await db.query("select workflow_version v from public.repair_access_orders where id=$1", [noFault])).rows[0].v;
    const exceptional = [noFault, nfVersion, randomUUID(), today, "Revision excepcional sin cobertura", "", "", false];
    await assert.rejects(asUser(db, admin, startSql, exceptional), (e: any) => e.code === "23514");
    exceptional[7] = true;
    const outsideCoverage = await asUser(db, admin, startSql, exceptional);
    assert.equal(outsideCoverage.version, 1);
    const future = (await db.query("select ((now() at time zone 'America/Argentina/Buenos_Aires')::date+1)::text d")).rows[0].d;
    await assert.rejects(asUser(db, admin, startSql, [noFault, nfVersion, randomUUID(), future, "Future visit", "", "", true]), (e: any) => e.code === "23514");
    const searchPage = await asUser(db, tech, "select public.workshop_warranty_read(p_search=>'sintetico',p_page_size=>1) result");
    assert.equal(searchPage.items.length, 0);
    const activePage = await asUser(db, tech, "select public.workshop_warranty_read(p_search=>'garantia',p_page_size=>1) result");
    assert.ok(activePage.total >= activePage.items.length);
    const historyPage = await asUser(db, admin, "select public.workshop_warranty_read(p_closed=>true,p_search=>'WARRANTY-LOCAL') result");
    assert.equal(historyPage.items.length, 1); assert.ok(historyPage.items[0].closedAt);
    console.log("PASS exceptional coverage acknowledgement, future date validation, scoped search and withdrawn history");

    await assert.rejects(asUser(db, tech, "update public.repair_warranty_returns set progress='Bypass' where id=$1 returning id result", [second.id]), (e: any) => e.code === "42501");
    const outsider = randomUUID();
    await assert.rejects(asUser(db, outsider, "select public.workshop_warranty_read() result"), (e: any) => e.code === "42501");
    await assert.rejects(asUser(db, outsider, saveSql, [second.id, 1, randomUUID(), "en_revision", "", "", ""]), (e: any) => e.code === "42501");
    console.log("PASS RLS/direct-write boundary and non-operations access denied");
  } finally { await db.query("rollback"); await db.end(); }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
