import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { ANON_KEY, IDENTITIES, LOCAL, assertLocalUrl } from "./config";
import { connectDatabase } from "./db";

const appUrl = "http://127.0.0.1:3001";
assertLocalUrl(appUrl);
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");

async function session(email: string) {
  const cookies = new Map<string, string>();
  const client = createServerClient(LOCAL.apiUrl, ANON_KEY, { cookies: {
    getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
    setAll: (next: { name: string; value: string }[]) => next.forEach(({ name, value }) => cookies.set(name, value))
  } });
  const result = await client.auth.signInWithPassword({ email, password: LOCAL.password });
  if (result.error) throw new Error("Synthetic local login failed");
  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
}

async function read(path: string, cookie: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", cookie);
  const response = await fetch(appUrl + path, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(45000) });
  return response;
}

async function main() {
  const health = await fetch(LOCAL.apiUrl + "/health", { signal: AbortSignal.timeout(5000) });
  const metadata = await health.json();
  assert.equal(metadata.staging, true); assert.equal(metadata.database, LOCAL.database);
  const db = await connectDatabase();
  let orderId: string;
  try {
    const result = await db.query("select id from public.repair_access_orders where issue_reported like $1 order by created_at desc,id desc limit 1", [LOCAL.fixtureTag + "%"]);
    assert.ok(result.rows.length, "Run the synthetic seed first");
    orderId = result.rows[0].id;
  } finally { await db.end(); }
  const admin = await session(IDENTITIES[0].email), technician = await session(IDENTITIES[1].email);
  for (const path of ["/dashboard", "/productos", "/ventas", "/gastos", "/sueldos", "/visitas", "/terciarizaciones", "/reportes", "/facturacion", "/configuracion", "/reparaciones-access?view=ordenes"]) {
    const response = await read(path, admin);
    assert.equal(response.status, 200, `Admin ${path}`);
    const body = await response.text();
    assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"), `Server error in ${path}`);
  }
  for (const path of ["/dashboard", "/reparaciones-access?view=ordenes", "/visitas"]) {
    const response = await read(path, technician); assert.equal(response.status, 200, `Technician ${path}`); await response.text();
  }
  const denied = await read("/api/fiscal/readiness", technician);
  assert.equal(denied.status, 403); await denied.text();
  const readiness = await read("/api/fiscal/readiness", admin);
  assert.equal(readiness.status, 200); assert.equal((await readiness.json()).readiness.ready, false, "Local staging must NEVER issue fiscal vouchers");
  const pdf = await read(`/api/repair-access/documents/${orderId}?kind=intake`, admin);
  assert.equal(pdf.status, 200); assert.ok(pdf.headers.get("content-type")?.includes("application/pdf"));
  const bytes = Buffer.from(await pdf.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const data = new FormData(); data.set("orderId", orderId); data.set("file", new File([pixel], "staging-pixel.png", { type: "image/png" }));
  const uploaded = await read("/api/repair-access/attachments", technician, { method: "POST", headers: { origin: appUrl }, body: data });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const attachmentId = (await uploaded.json()).id;
  const photo = await read(`/api/repair-access/attachments/${attachmentId}`, technician);
  assert.equal(photo.status, 307);
  assert.ok(photo.headers.get("location")?.startsWith(LOCAL.apiUrl + "/storage/"));
  await photo.text();
  console.log("PASS Next.js authenticated routes, technician denial, disabled fiscal issuance, real private PDF, private photo upload and signed access. Only synthetic staging data was written.");
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Local smoke test failed"); process.exitCode = 1; });
