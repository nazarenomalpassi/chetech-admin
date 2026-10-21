import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";
const [admin,tech]=IDENTITIES.map(user=>user.id);
const rpc="select public.workshop_warranty_save($1,$2,$3,$4,$5,$6,$7) result";
async function asUser(db: Database,actor:string,args:unknown[]) {
  await db.query("savepoint operation");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:actor,role:"authenticated"}),actor]);
    await db.query("set local role authenticated");
    const result=(await db.query(rpc,args)).rows[0].result;
    await db.query("reset role"); await db.query("release savepoint operation"); return result;
  } catch(error) { await db.query("rollback to savepoint operation"); throw error; }
}
async function main() {
  const db=await connectDatabase();
  try {
    if(process.argv.includes("--apply")) {
      const folder=new URL("../../supabase/migrations/",import.meta.url);
      const file=readdirSync(folder).find(name=>name.endsWith("_warranty_return_single_step_pickup.sql"));
      assert.ok(file); await db.query(readFileSync(new URL(file,folder),"utf8"));
    }
    await db.query("begin");
    const customer=randomUUID(),device=randomUUID(),order=randomUUID();
    await db.query("insert into public.repair_access_customers(id,full_name) values($1,'WARRANTY-PICKUP Synthetic')",[customer]);
    await db.query("insert into public.repair_access_devices(id,customer_id,device_type) values($1,$2,'Synthetic TV')",[device,customer]);
    await db.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported) values($1,$2,$3,'Original fault')",[order,customer,device]);
    await db.query("update public.repair_access_orders set status='retirado',picked_up_at=now()-interval '5 days',delivered_at=now()-interval '5 days',has_warranty=true,warranty_days=90,is_paid=true,paid_at=now()-interval '5 days',budget_amount=50000,final_amount=50000,budgeted_at=now()-interval '6 days' where id=$1",[order]);
    const preserved=async()=>(await db.query("select jsonb_build_object('order',(select to_jsonb(o) from public.repair_access_orders o where id=$1),'cash',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.movimientos_caja t),'settings',(select md5(jsonb_agg(to_jsonb(t) order by key)::text) from public.app_settings t),'payments',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.repair_access_payments t),'legacy',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.repairs t)) result",[order])).rows[0].result;
    const before=await preserved();
    for(const status of ['pendiente_revision','en_revision','en_reparacion','en_pruebas','listo_para_retirar','no_presenta_fallas','sin_solucion']) {
      const id=randomUUID(),operation=randomUUID();
      await db.query("insert into public.repair_warranty_returns(id,order_id,received_on,issue_reported,status,original_delivery_at,created_by,updated_by) values($1,$2,current_date,'Falla de retroiluminacion',$3,now()-interval '5 days',$4,$4)",[id,order,status,admin]);
      const args=[id,1,operation,'retirado','Retiro del equipo','Se reparo la retroiluminacion','Cliente sintetico'];
      await assert.rejects(asUser(db,tech,args),(e:any)=>e.code==='42501');
      await assert.rejects(asUser(db,admin,[id,1,randomUUID(),'retirado','','',' ']),(e:any)=>e.code==='23514');
      if(!['listo_para_retirar','no_presenta_fallas','sin_solucion'].includes(status)) {
        await assert.rejects(asUser(db,admin,[id,1,randomUUID(),'retirado','','','Cliente']),(e:any)=>e.code==='23514');
      }
      const result=await asUser(db,admin,args); assert.equal(result.status,'retirado'); assert.equal(result.version,2);
      assert.equal((await asUser(db,admin,args)).replayed,true);
      await assert.rejects(asUser(db,admin,[id,2,randomUUID(),'en_reparacion','','','']),(e:any)=>e.code==='23514');
      await assert.rejects(asUser(db,admin,[id,1,randomUUID(),'retirado','','Otro resultado','Cliente']),(e:any)=>e.code==='40001');
      const row=(await db.query("select * from public.repair_warranty_returns where id=$1",[id])).rows[0];
      assert.equal(row.resolution,args[5]); assert.equal(row.progress,args[4]); assert.equal(row.recipient,args[6]); assert.ok(row.closed_at);
      assert.equal((await db.query("select count(*)::int n from public.audit_logs where entity_id=$1 and action='update'",[id])).rows[0].n,1);
      assert.deepEqual(await preserved(),before);
      console.log(`PASS ${status}: resolution and pickup saved once; recipient/role/version guarded; original order and money unchanged`);
    }
    console.log("PASS all fixtures rolled back; no real orders touched");
  } finally { await db.query("rollback"); await db.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
