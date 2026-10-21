import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connectDatabase } from "./db";
import { FIXTURES } from "./seed";
import { IDENTITIES } from "./config";
import { mapOrder } from "../../src/features/repairs-access/queries";
import { buildRepairDocumentData } from "../../src/features/repairs-access/documents";
import { readDocumentPayments } from "../../src/features/repairs-access/document-payments";
import { generateRepairDocumentPdf } from "../../src/features/repairs-access/repair-document-pdf";

async function main() {
  const db = await connectDatabase();
  try {
    const installed = await db.query("select to_regclass('public.repair_document_deliveries') relation");
    const migration = readFileSync(new URL("../../supabase/migrations/20261021202928_whatsapp_repair_document_delivery.sql", import.meta.url), "utf8");
    const fresh=process.argv.includes("--fresh");
    if(fresh){
      await db.query("begin");
      await db.query("drop table if exists private.repair_document_snapshot_history,private.repair_document_snapshots,private.whatsapp_recipient_optouts,private.whatsapp_automation_config,public.repair_document_deliveries cascade");
      const functions=await db.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like 'whatsapp_%' or p.proname='save_repair_access_intake_with_documents')");
      for(const row of functions.rows)await db.query(`drop function if exists ${row.signature} cascade`);
      await db.query("alter table public.repair_access_orders drop column if exists whatsapp_document_consent,drop column if exists whatsapp_consent_recorded_at,drop column if exists whatsapp_consent_phone");
      await db.query(migration.replace(/^begin;/," ").replace(/commit;\s*$/," "));
    }
    else if (!installed.rows[0].relation) await db.query(migration);
    else if (process.argv.includes("--refresh-functions")) {
      await db.query("alter table public.repair_access_orders add column if not exists whatsapp_consent_phone text");
      await db.query("alter table public.repair_document_deliveries add column if not exists submission_started_at timestamptz");
      await db.query("alter table public.repair_document_deliveries add column if not exists recovered_at timestamptz");
      await db.query(migration.slice(migration.indexOf("create table private.repair_document_snapshot_history"),migration.indexOf("revoke all on private.repair_document_snapshots")).replace("create table private.repair_document_snapshot_history","create table if not exists private.repair_document_snapshot_history"));
      for (const [definition] of migration.matchAll(/create function [\s\S]+?\$\$;/g)) await db.query(definition.replace(/^create function/, "create or replace function"));
      await db.query("drop trigger if exists repair_document_consent_guard on public.repair_access_orders; create trigger repair_document_consent_guard before update on public.repair_access_orders for each row execute function private.whatsapp_consent_guard()");
      await db.query(migration.slice(migration.indexOf("do $$ declare r record;"),migration.lastIndexOf("commit;")));
    }
    if(!fresh)await db.query("begin");
    // Match hosted Supabase's JWT-based role helper; the reconstructed fixture used current_user.
    await db.query("create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user::text) $$");
    const actor = async (role: string) => {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: role === "admin" ? IDENTITIES[0].id : IDENTITIES[1].id, role: role === "service" ? "service_role" : "authenticated" })]);
      await db.query(`set local role ${role === "service" ? "service_role" : "authenticated"}`);
    };
    const scalar = async (sql: string, args: unknown[] = []) => (await db.query(sql,args)).rows[0]?.result;
    const reject = async (sql: string, args: unknown[] = []) => {
      await db.query("savepoint rejected_call");
      await assert.rejects(db.query(sql,args));
      await db.query("rollback to savepoint rejected_call");
    };
    await actor("admin");
    const payload = { customer_id: FIXTURES.customer, device_id: FIXTURES.device,
      customer_name: "Cliente prueba WhatsApp", customer_phone: "3571544683", customer_address: "Domicilio sintetico",
      device_type: "Televisor", device_brand: "Marca", device_model: "Modelo", device_color: "Negro", accessory_details: "Control y cable",
      intake_date: "2026-10-21", issue_reported: "Prueba de documento automatico", status: "pendiente_revision", whatsapp_document_consent: true };
    const intake = (data: object) => scalar("select public.save_repair_access_intake_with_documents($1::jsonb) result",[JSON.stringify(data)]);
    const inactive = await intake(payload);
    assert.equal((await db.query("select count(*)::int count from public.repair_document_deliveries where order_id=$1",[inactive.id])).rows[0].count,0);
    await actor("service");
    await reject("select public.whatsapp_set_automation(true)");
    await db.query("select public.whatsapp_verify_webhook()");
    await db.query("select public.whatsapp_set_automation(true)");
    await actor("admin");
    const created = await intake(payload);
    const count = async () => Number((await db.query("select count(*)::int count from public.repair_document_deliveries where order_id=$1",[created.id])).rows[0].count);
    assert.equal(await count(),1);
    await intake({ ...payload, id: created.id, notes: "Edicion posterior" });
    assert.equal(await count(),1,"Editing must not enqueue a second intake");
    await reject("select public.whatsapp_claim_document()");
    await actor("tech");
    assert.equal(await count(),0,"Technicians cannot read financial delivery metadata");
    await reject("select private.whatsapp_enqueue_document($1,'intake')",[inactive.id]);
    await reject("select * from private.repair_document_snapshots");
    await actor("service");
    const first = await scalar("select public.whatsapp_claim_document() result");
    assert.equal(first.order_id,created.id); assert.equal(first.recipient,"5493571544683");
    assert.equal(await scalar("select public.whatsapp_claim_document() result"),null,"A leased job cannot be claimed twice");
    const intakePdf = await generateRepairDocumentPdf(buildRepairDocumentData(mapOrder(first.snapshot),"intake"));
    assert.equal(intakePdf.subarray(0,5).toString(),"%PDF-");
    const update = (action: string,value: string|null=null) => scalar("select public.whatsapp_update_document($1,$2,$3,$4) result",[first.id,first.lease_token,action,value]);
    assert.equal(await update("prepare"),true);
    assert.equal(await scalar("select public.whatsapp_update_document($1,gen_random_uuid(),'submitting') result",[first.id]),false,"Wrong lease is rejected");
    assert.equal(await update("submitting"),true);
    await db.query("select public.whatsapp_document_status($1,$2,'read',$3,now())",["wamid.synthetic",first.id,first.recipient]);
    assert.equal(await update("accepted","wamid.synthetic"),true);
    await actor("admin");
    await reject("select public.whatsapp_recover_document($1)",[first.id]);
    await actor("service");
    await db.query("select public.whatsapp_document_status($1,$2,'sent',$3,now())",["wamid.synthetic",first.id,first.recipient]);
    assert.equal((await db.query("select status from public.repair_document_deliveries where id=$1",[first.id])).rows[0].status,"read");
    await actor("admin");
    const noConsent = await intake({ ...payload, whatsapp_document_consent: false });
    assert.equal((await db.query("select count(*)::int count from public.repair_document_deliveries where order_id=$1",[noConsent.id])).rows[0].count,0);
    const invalid = await intake({ ...payload, customer_phone: "123456" });
    assert.equal((await db.query("select status from public.repair_document_deliveries where order_id=$1",[invalid.id])).rows[0].status,"blocked");
    // Restore the shared synthetic customer's valid number before the pickup snapshot.
    await intake({ ...payload, id: created.id });
    const invalidJob=(await db.query("select id from public.repair_document_deliveries where order_id=$1",[invalid.id])).rows[0].id;
    await intake({...payload,id:invalid.id});
    await actor("service");
    await db.query("update public.repair_document_deliveries set created_at=now()-interval '1 day' where id=$1",[invalidJob]);
    await db.query("select public.whatsapp_set_automation(false)");
    await db.query("select public.whatsapp_set_automation(true)");
    await actor("admin");
    await db.query("select public.whatsapp_recover_document($1)",[invalidJob]);
    assert.equal((await db.query("select status from public.repair_document_deliveries where id=$1",[invalidJob])).rows[0].status,"pending");
    await actor("service");
    const recovered=await scalar("select public.whatsapp_claim_document() result");
    assert.equal(recovered.id,invalidJob);assert.equal(recovered.recipient,"5493571544683");
    await db.query("select public.whatsapp_update_document($1,$2,'blocked','synthetic_stop')",[recovered.id,recovered.lease_token]);
    await actor("admin");
    await db.query("update public.repair_access_orders set status='retirado',picked_up_at=now(),delivered_at=now(),has_warranty=true,warranty_days=90,budget_amount=150000,final_amount=150000,budgeted_at=now()-interval '1 day',budget_detail='Detalle exacto del presupuesto' where id=$1",[created.id]);
    assert.equal(await count(),2,"First pickup enqueues the combined document once");
    await db.query("update public.repair_access_orders set notes='Correccion interna' where id=$1",[created.id]);
    assert.equal(await count(),2);
    await actor("service");
    const delivery = await scalar("select public.whatsapp_claim_document() result");
    assert.equal(delivery.kind,"delivery");
    const model = buildRepairDocumentData(mapOrder(delivery.snapshot),"delivery",null,readDocumentPayments(delivery.snapshot));
    assert.equal(model.client?.budgetDetail,"Detalle exacto del presupuesto");
    assert.equal(model.client?.paidTotal,0,"A paid flag never invents a ledger payment");
    const pdf = await generateRepairDocumentPdf(model); assert.equal(pdf.subarray(0,5).toString(),"%PDF-");
    await db.query("select public.whatsapp_update_document($1,$2,'submitting')",[delivery.id,delivery.lease_token]);
    await db.query("update public.repair_document_deliveries set lease_until=now()-interval '1 second' where id=$1",[delivery.id]);
    assert.equal(await scalar("select public.whatsapp_claim_document() result"),null);
    assert.equal((await db.query("select status from public.repair_document_deliveries where id=$1",[delivery.id])).rows[0].status,"uncertain");
    await actor("admin");await reject("select public.whatsapp_recover_document($1)",[delivery.id]);await actor("service");
    await db.query("select public.whatsapp_document_status($1,$2,'delivered',$3,now())",["wamid.delivery",delivery.id,delivery.recipient]);
    assert.equal((await db.query("select status from public.repair_document_deliveries where id=$1",[delivery.id])).rows[0].status,"delivered");
    // Exhausted preparation leases must reach a terminal state instead of becoming stuck.
    await db.query("update public.repair_document_deliveries set status='processing',attempts=5,lease_until=now()-interval '1 second' where id=$1",[invalidJob]);
    assert.equal(await scalar("select public.whatsapp_claim_document() result"),null);
    assert.equal((await db.query("select status from public.repair_document_deliveries where id=$1",[invalidJob])).rows[0].status,"failed");
    await db.query("select public.whatsapp_document_optout($1)",[delivery.recipient]);
    await actor("admin");
    const optedOut = await intake(payload);
    assert.equal((await db.query("select count(*)::int count from public.repair_document_deliveries where order_id=$1",[optedOut.id])).rows[0].count,0);
    await db.query("rollback");
    console.log("PASS inactive/consent/import gates, atomic snapshots, one job per document, RLS, leases, real PDFs, first pickup, no edit resend, uncertain reconciliation, monotonic webhooks and opt-out. All synthetic business fixtures rolled back.");
  } catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Local WhatsApp verification failed"); process.exitCode=1; });
