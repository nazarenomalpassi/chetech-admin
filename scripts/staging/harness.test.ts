import assert from "node:assert/strict";
import { test } from "node:test";

const base = "http://127.0.0.1:54341";

async function api(path: string, options: RequestInit = {}, token?: string) {
  const config = await fetch(`${base}/health`).then((r) => r.json());
  return fetch(`${base}${path}`, {
    ...options,
    headers: { apikey: config.anonKey, "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
}

async function login(email = "admin@staging.invalid") {
  const r = await api("/auth/v1/token?grant_type=password", { method: "POST",
    body: JSON.stringify({ email, password: "Chetech-staging-only-20261005!" }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}

test("localhost harness serves health and synthetic auth configuration", async () => {
  const response = await fetch(`${base}/health`).catch(() => null);
  assert.ok(response, "staging HTTP harness is not running");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.staging, true);
  assert.equal(body.database, "chetech_staging");
  assert.equal(body.postgrest, true);
});

test("password login, signed user lookup, rotating refresh, local logout", async () => {
  const session = await login();
  assert.equal(session.user.app_metadata.role, "admin");
  assert.equal(session.token_type, "bearer");
  assert.equal(session.expires_in, 3600);
  const user = await api("/auth/v1/user", {}, session.access_token);
  assert.equal(user.status, 200);
  assert.equal((await user.json()).id, session.user.id);
  const refreshed = await api("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
  assert.equal(refreshed.status, 200);
  const rotated = await refreshed.json();
  assert.notEqual(rotated.refresh_token, session.refresh_token);
  const parallel = await api("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
  assert.equal(parallel.status, 200);
  assert.equal((await parallel.json()).refresh_token, rotated.refresh_token);
  const logout = await api("/auth/v1/logout?scope=local", { method: "POST" }, rotated.access_token);
  assert.equal(logout.status, 204);
  const revoked = await api("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token: rotated.refresh_token }) });
  assert.equal(revoked.status, 400);
});

test("rejects invalid password, tampered JWT, missing API key and external origins", async () => {
  const bad = await api("/auth/v1/token?grant_type=password", { method: "POST",
    body: JSON.stringify({ email: "admin@staging.invalid", password: "wrong" }) });
  assert.equal(bad.status, 400);
  const session = await login();
  const pieces = session.access_token.split(".");
  pieces[1] = Buffer.from(JSON.stringify({ sub: session.user.id, role: "authenticated", exp: 2100000000 })).toString("base64url");
  assert.equal((await api("/auth/v1/user", {}, pieces.join("."))).status, 401);
  assert.equal((await api("/rest/v1/profiles", {}, pieces.join("."))).status, 401);
  assert.equal((await fetch(`${base}/rest/v1/profiles`)).status, 401);
  assert.equal((await api("/rest/v1/profiles", { headers: { origin: "https://example.com" } })).status, 403);
  assert.equal((await api("/rest/v1/profiles", { headers: { "accept-profile": "private" } }, session.access_token)).status, 403);
  assert.equal((await api("/auth/v1/user", {}, (await fetch(`${base}/health`).then((r) => r.json())).anonKey)).status, 401);
});

test("real PostgreSQL RLS gives technicians only their profile and hides products", async () => {
  const admin = await login();
  const tech = await login("tech@staging.invalid");
  assert.equal(tech.user.app_metadata.role, "tecnico");
  const profiles = await api("/rest/v1/profiles?select=id,role", {}, tech.access_token);
  assert.equal(profiles.status, 200, await profiles.clone().text());
  assert.deepEqual(await profiles.json(), [{ id: tech.user.id, role: "tecnico" }]);
  const products = await api("/rest/v1/products?select=id&limit=1", {}, tech.access_token);
  assert.equal(products.status, 200);
  assert.deepEqual(await products.json(), []);
  const denied = await api("/rest/v1/products", { method: "POST", body: JSON.stringify({ sku: "UNAUTHORIZED", name: "Forbidden" }) }, tech.access_token);
  assert.equal(denied.status, 403);
  const own = await api(`/rest/v1/profiles?id=eq.${admin.user.id}&select=id,role`, {}, admin.access_token);
  assert.equal(own.status, 200, await own.clone().text());
  assert.equal((await own.json())[0].role, "admin");
});
