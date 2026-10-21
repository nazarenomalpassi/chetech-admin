import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { ANON_KEY, IDENTITIES, LOCAL, assertLocalUrl } from "./config";
import { connectDatabase } from "./db";
import { DELIVERY_DOCUMENT_SELECT, readDocumentPayments } from "../../src/features/repairs-access/document-payments";

const appUrl = "http://127.0.0.1:3001";
async function session(email: string) {
  const cookies = new Map<string, string>();
  const client = createServerClient(LOCAL.apiUrl, ANON_KEY, { cookies: {
    getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
    setAll: (next: { name: string; value: string }[]) => next.forEach(({ name, value }) => cookies.set(name, value))
  } });
  const result = await client.auth.signInWithPassword({ email, password: LOCAL.password });
  assert.ifError(result.error);
  return { client, cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ") };
}

async function main() {
  assertLocalUrl(appUrl); assertLocalUrl(LOCAL.apiUrl);
  const db = await connectDatabase();
  try {
    const candidates = await db.query("select id from public.repair_access_orders where picked_up_at is not null and (notes like $1 or issue_reported like $1 or issue_reported like 'Prueba local aislada:%') order by created_at desc limit 1", [LOCAL.fixtureTag + "%"]);
    assert.ok(candidates.rows.length, "Needs an existing synthetic delivered fixture; no production or imported records are used");
    const id = candidates.rows[0].id;
    const before = await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [id]);
    const admin = await session(IDENTITIES[0].email);
    const settings=await fetch(`${appUrl}/configuracion`,{headers:{cookie:admin.cookie},redirect:"manual"});
    assert.equal(settings.status,200,"Settings page must render");assert.ok((await settings.text()).includes("Comprobantes por WhatsApp"));
    const deliveryState=await fetch(`${appUrl}/api/whatsapp/documents?order=${id}`,{headers:{cookie:admin.cookie},redirect:"manual"});
    assert.equal(deliveryState.status,200,await deliveryState.clone().text());assert.equal((await deliveryState.json()).enabled,false,"Local automation stays paused");
    const worker=await fetch(`${appUrl}/api/whatsapp/worker`,{method:"POST",redirect:"manual"});assert.equal(worker.status,401);
    const webhook=await fetch(`${appUrl}/api/whatsapp/webhook`,{method:"POST",body:"{}",redirect:"manual"});assert.equal(webhook.status,503);
    const snapshot = await admin.client.from("repair_access_orders").select(DELIVERY_DOCUMENT_SELECT).eq("id", id).single();
    assert.ifError(snapshot.error);
    const payments = readDocumentPayments(snapshot.data);
    const expected = await db.query(`select coalesce(sum(amount),0)::text total from (
      select p.amount from public.repairs r join public.repair_payments p on p.repair_id=r.id where r.repair_access_order_id=$1
      union all select amount from public.repair_access_payments where repair_order_id=$1 and voided_at is null and legacy_repair_payment_id is null
    ) p`, [id]);
    assert.equal(payments.payments.reduce((sum, p) => sum + Math.round(p.amount * 100), 0), Math.round(Number(expected.rows[0].total) * 100));
    mkdirSync("tmp/pdfs", { recursive: true });
    for (const kind of ["intake", "delivery"]) {
      const response = await fetch(`${appUrl}/api/repair-access/documents/${id}?kind=${kind}`, { headers: { cookie: admin.cookie }, redirect: "manual", signal: AbortSignal.timeout(90000) });
      assert.equal(response.status, 200, await response.clone().text().then((s) => s.slice(0,300)));
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("Content-Type"), "application/pdf");
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      writeFileSync(`tmp/pdfs/staging-${kind}.pdf`, bytes);
    }
    const tech = await session(IDENTITIES[1].email);
    const denied = await fetch(`${appUrl}/api/repair-access/documents/${id}?kind=delivery`, { headers: { cookie: tech.cookie }, redirect: "manual" });
    assert.equal(denied.status, 403);
    const anonymous = await fetch(`${appUrl}/api/repair-access/documents/${id}?kind=intake`, { redirect: "manual" });
    assert.ok([303, 307, 401, 403].includes(anonymous.status));
    const after = await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [id]);
    assert.deepEqual(after.rows, before.rows, "PDF downloads must not mutate the order");
    console.log("PASS authenticated nested snapshot, canonical payment totals, both PDF endpoints, private cache, technician/anonymous protection and unchanged order. No business writes.");
  } finally { await db.end(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Staging document check failed"); process.exitCode = 1; });
