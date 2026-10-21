import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { ANON_KEY, IDENTITIES, LOCAL, assertLocalUrl } from "./config";
import { connectDatabase } from "./db";

const app="http://127.0.0.1:3001";
async function login(email:string){
  const cookies=new Map<string,string>();
  const client=createServerClient(LOCAL.apiUrl,ANON_KEY,{cookies:{getAll:()=>Array.from(cookies,([name,value])=>({name,value})),setAll:(values:{name:string;value:string}[])=>values.forEach(({name,value})=>cookies.set(name,value))}});
  const result=await client.auth.signInWithPassword({email,password:LOCAL.password});assert.ifError(result.error);
  return Array.from(cookies,([name,value])=>`${name}=${value}`).join("; ");
}
async function main(){
  assertLocalUrl(app);const db=await connectDatabase();let orderId:string|undefined;
  const links:string[]=[],audits:string[]=[];
  try{
    const row=(await db.query("select o.id,to_jsonb(o) original,c.phone from public.repair_access_orders o join public.repair_access_customers c on c.id=o.customer_id where o.picked_up_at is not null and o.issue_reported like 'Prueba local aislada:%' and length(regexp_replace(c.phone,'[^0-9]','','g'))=10 limit 1")).rows[0];
    assert.ok(row,"Needs a synthetic delivered fixture with valid phone");orderId=row.id;
    const before=JSON.stringify(row.original),admin=await login(IDENTITIES[0].email),tech=await login(IDENTITIES[1].email);
    const post=(kind:string,cookie:string,intent="send",origin=app)=>fetch(`${app}/api/repair-access/document-shares`,{method:"POST",headers:{cookie,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({orderId,kind,intent}),redirect:"manual",signal:AbortSignal.timeout(90000)});
    assert.equal((await post("intake",tech)).status,403);assert.equal((await post("intake"," ")).status,403);assert.equal((await post("intake",admin,"send","https://evil.invalid")).status,403);
    for(const kind of ["intake","delivery"]){
      const beforeLinks=(await db.query("select id from private.repair_document_links where order_id=$1",[orderId])).rows.map(r=>r.id);
      const response=await post(kind,admin);assert.equal(response.status,303,await response.clone().text());
      const target=new URL(response.headers.get("location")!);assert.equal(target.origin,"https://web.whatsapp.com");
      const link=target.searchParams.get("text")!.match(/http:\/\/127\.0\.0\.1:3001\/api\/comprobantes\/[a-f0-9]{64}/)![0];assertLocalUrl(link);
      links.push(...(await db.query("select id from private.repair_document_links where order_id=$1 and not(id=any($2::uuid[]))",[orderId,beforeLinks])).rows.map(r=>r.id));
      const pdf=await fetch(link,{redirect:"manual"});assert.equal(pdf.status,200,await pdf.clone().text().then(t=>t.slice(0,100)));assert.equal(pdf.headers.get("content-type"),"application/pdf");assert.ok(pdf.headers.get("cache-control")!.includes("no-store"));assert.ok(pdf.headers.get("x-robots-tag")!.includes("noindex"));
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),"%PDF-");assert.equal((await fetch(link,{method:"HEAD"})).status,200);assert.equal((await fetch(link)).status,200,"Previews never consume the link");
      const revoke=await post(kind,admin,"revoke");assert.equal(revoke.status,200);assert.equal((await fetch(link)).status,404);
    }
    assert.equal((await fetch(`${app}/api/comprobantes/REP-000513`,{redirect:"manual"})).status,404);
    assert.equal(JSON.stringify((await db.query("select to_jsonb(o) original from public.repair_access_orders o where id=$1",[orderId])).rows[0].original),before);
    console.log("PASS real HTTP: same-origin/admin guards, both WhatsApp Web redirects without following them, anonymous customer PDFs, repeat/HEAD access, revocation and unchanged synthetic repair. No messages sent.");
  }finally{
    if(orderId&&links.length){
      audits.push(...(await db.query("select id from public.audit_logs where entity_id=$1 and user_id=$2 and (changes->>'link_id'=any($3::text[]) or (changes->>'operation'='manual_receipt_links_revoked' and created_at>now()-interval '3 minutes'))",[orderId,IDENTITIES[0].id,links])).rows.map(r=>r.id));
      if(audits.length)await db.query("delete from public.audit_logs where id=any($1::uuid[])",[audits]);
      await db.query("delete from private.repair_document_links where id=any($1::uuid[])",[links]);
    }
    await db.end();
  }
}
void main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
