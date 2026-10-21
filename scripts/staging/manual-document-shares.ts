import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connectDatabase } from "./db";
import { IDENTITIES } from "./config";
import { createDocumentToken, hashDocumentToken, sharedDocumentSchema, toSharedDocument } from "../../src/features/repairs-access/document-share";
import { mapOrder } from "../../src/features/repairs-access/queries";
import { readDocumentPayments } from "../../src/features/repairs-access/document-payments";
import { buildRepairDocumentData } from "../../src/features/repairs-access/documents";
import { generateRepairDocumentPdf } from "../../src/features/repairs-access/repair-document-pdf";

async function main(){
  const db=await connectDatabase();
  try{
    const migration=readFileSync(new URL("../../supabase/migrations/20261021214432_manual_repair_document_shares.sql",import.meta.url),"utf8");
    const fresh=process.argv.includes("--fresh");
    if(fresh){
      await db.query("begin");
      await db.query("drop schema if exists document_access cascade; drop table if exists private.repair_document_links cascade");
      for(const row of (await db.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('issue_repair_document_link','revoke_repair_document_links','read_repair_document_link','minimize_shared_repair_document')")).rows)await db.query(`drop function if exists ${row.signature} cascade`);
      await db.query(migration.replace(/^begin;/," ").replace(/commit;\s*$/," "));
    }
    else if(!(await db.query("select to_regclass('private.repair_document_links') present")).rows[0].present)await db.query(migration);
    else if(process.argv.includes("--refresh-functions")){
      for(const [definition] of migration.matchAll(/create function [\s\S]+?\$\$;/g))await db.query(definition.replace(/^create function/,"create or replace function"));
      await db.query("revoke all on function private.minimize_shared_repair_document(jsonb) from public,anon,authenticated");
    }
    if(!fresh)await db.query("begin");
    const row=(await db.query("select id,to_jsonb(o) original from public.repair_access_orders o where picked_up_at is not null and issue_reported like 'Prueba local aislada:%' limit 1")).rows[0];
    assert.ok(row,"Needs only an existing synthetic delivered fixture");
    const before=JSON.stringify(row.original);
    const raw=(await db.query("select private.whatsapp_document_snapshot($1) data",[row.id])).rows[0].data;
    const document={...buildRepairDocumentData(mapOrder(raw),"delivery",null,readDocumentPayments(raw)),issuedAt:new Date().toISOString()};
    const expected=toSharedDocument(document);
    assert.equal(sharedDocumentSchema.safeParse(document).success,true);
    const actor=async(role:"admin"|"tech"|"anon")=>{
      await db.query("reset role");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:role==="admin"?IDENTITIES[0].id:role==="tech"?IDENTITIES[1].id:undefined,role:role==="anon"?"anon":"authenticated"})]);
      await db.query(`set local role ${role==="anon"?"anon":"authenticated"}`);
    };
    const reject=async(sql:string,args:unknown[]=[])=>{await db.query("savepoint denial");await assert.rejects(db.query(sql,args));await db.query("rollback to savepoint denial");};
    const read=async(token:string)=>(await db.query("select public.read_repair_document_link($1) data",[token])).rows[0].data;
    const first=createDocumentToken(),second=createDocumentToken();
    await actor("admin");
    await db.query("select public.issue_repair_document_link($1,'delivery',$2,$3::jsonb)",[row.id,hashDocumentToken(first),JSON.stringify(document)]);
    await db.query("select public.issue_repair_document_link($1,'delivery',$2,$3::jsonb)",[row.id,hashDocumentToken(second),JSON.stringify(document)]);
    for(const bad of [
      {...document,client:{...document.client,name:{internalNotes:"SECRET OBJECT"}}},
      {...document,client:{...document.client,payments:[{method:{internalNotes:"SECRET METHOD"},amount:1,date:null}]}},
      {...document,client:{...document.client,warranty:{...document.client!.warranty,status:{internalNotes:"SECRET STATUS"}}}}
    ])await reject("select public.issue_repair_document_link($1,'delivery',$2,$3::jsonb)",[row.id,hashDocumentToken(createDocumentToken()),JSON.stringify(bad)]);
    await db.query("savepoint mutable_sources");
    await db.query("update public.repair_access_orders set budget_amount=coalesce(budget_amount,0)+1000 where id=$1",[row.id]);
    await db.query("insert into public.repair_access_payments(repair_order_id,method,amount,payment_date,created_by) values($1,'efectivo',100,'2026-10-21',$2)",[row.id,IDENTITIES[0].id]);
    assert.deepEqual((await read(first)).document,expected,"Changes to the live budget/payment ledger cannot change an issued receipt");
    await db.query("rollback to savepoint mutable_sources");
    await actor("anon");
    const received=await read(first);assert.deepEqual(received.document,expected);
    assert.equal(received.document.client.phone,"");assert.equal(received.document.client.address,"");assert.equal(received.document.client.fault,"");
    assert.ok(received.document.client.payments.every((p:any)=>p.id===""));
    assert.equal(Math.round((Date.parse(received.expiresAt)-Date.now())/86400000),365);
    assert.equal(await read(second)!==null,true,"Repeated share must not invalidate the first link");
    assert.equal(await read("x".repeat(64)),null);assert.equal(await read(createDocumentToken()),null);assert.equal(await read(row.id),null);
    await reject("select * from private.repair_document_links");
    await reject("select public.issue_repair_document_link($1,'delivery',$2,$3::jsonb)",[row.id,hashDocumentToken(createDocumentToken()),JSON.stringify(document)]);
    await reject("select public.revoke_repair_document_links($1,'delivery')",[row.id]);
    assert.equal((await db.query("select has_schema_privilege('anon','private','USAGE') allowed")).rows[0].allowed,false);
    const bytes=await generateRepairDocumentPdf(sharedDocumentSchema.parse(received.document));assert.equal(bytes.subarray(0,5).toString(),"%PDF-");
    await actor("tech");await reject("select public.issue_repair_document_link($1,'delivery',$2,$3::jsonb)",[row.id,hashDocumentToken(createDocumentToken()),JSON.stringify(document)]);
    await reject("select public.revoke_repair_document_links($1,'delivery')",[row.id]);
    await db.query("reset role");await db.query("update private.repair_document_links set expires_at=now()-interval '1 second' where token_hash=$1",[hashDocumentToken(second)]);
    await actor("anon");assert.equal(await read(second),null);assert.ok(await read(first));
    await actor("admin");assert.equal((await db.query("select public.revoke_repair_document_links($1,'intake') n",[row.id])).rows[0].n,0);assert.ok(await read(first));
    assert.equal((await db.query("select public.revoke_repair_document_links($1,'delivery') n",[row.id])).rows[0].n,2);
    await actor("anon");assert.equal(await read(first),null);
    await actor("admin");
    const intake=createDocumentToken(),intakeData={...buildRepairDocumentData(mapOrder(raw),"intake"),issuedAt:new Date().toISOString(),extra:"SECRET EXTRA"};
    await db.query("select public.issue_repair_document_link($1,'intake',$2,$3::jsonb)",[row.id,hashDocumentToken(intake),JSON.stringify({...intakeData,client:{...intakeData.client,extra:"SECRET CLIENT"}})]);
    await actor("anon");const intakeShared=await read(intake);assert.deepEqual(intakeShared.document,toSharedDocument(intakeData));
    assert.equal(intakeShared.document.client.budget,null);assert.equal(intakeShared.document.client.finalTotal,null);assert.deepEqual(intakeShared.document.client.payments,[]);assert.equal(intakeShared.document.amount,null);
    assert.ok(!JSON.stringify(intakeShared).includes("SECRET"));
    await db.query("reset role");await db.query("savepoint rate_limits");
    await db.query("insert into private.repair_document_links(order_id,kind,token_hash,document,created_by) select $1,'intake',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),$2::jsonb,$3 from generate_series(1,30)",[row.id,JSON.stringify(toSharedDocument(intakeData)),IDENTITIES[0].id]);
    await actor("admin");await reject("select public.issue_repair_document_link($1,'intake',$2,$3::jsonb)",[row.id,hashDocumentToken(createDocumentToken()),JSON.stringify(intakeData)]);
    await db.query("reset role");await db.query("rollback to savepoint rate_limits");
    await db.query("reset role");
    assert.equal(JSON.stringify((await db.query("select to_jsonb(o) original from public.repair_access_orders o where id=$1",[row.id])).rows[0].original),before,"Sharing never changes the repair");
    const logs=(await db.query("select changes::text value from public.audit_logs where entity_id=$1 and changes->>'operation' like 'manual_receipt%'",[row.id])).rows;
    assert.ok(logs.length>=3);assert.ok(logs.every(r=>!r.value.includes(first)&&!r.value.includes(second)),"Audit logs contain no capability tokens");
    console.log("PASS scoped anonymous PDF, persistent links, expiry, revocation, admin/technician permissions, no private-schema access and unchanged synthetic order. All fixtures rolled back; no WhatsApp messages sent.");
    await db.query("rollback");
  }finally{await db.end();}
}
void main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
