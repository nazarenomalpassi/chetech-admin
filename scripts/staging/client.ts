import assert from "node:assert/strict";
import { ANON_KEY, IDENTITIES, LOCAL, assertLocalUrl } from "./config";

export async function request(path: string, token?: string, method = "GET", input?: unknown, extra: Record<string, string> = {}) {
  assertLocalUrl(LOCAL.apiUrl);
  assert.ok(path.startsWith("/auth/v1/") || path.startsWith("/rest/v1/"), "Only auth/rest paths are allowed");
  const target = new URL(LOCAL.apiUrl + path);
  assert.equal(target.origin, LOCAL.apiUrl);
  const response = await fetch(target, { method, headers: { apikey: ANON_KEY, "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }), redirect: "error", signal: AbortSignal.timeout(30000) });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data };
}

export async function login(role: "admin" | "tecnico" = "admin") {
  const identity = IDENTITIES.find((i) => i.role === role)!;
  const result = await request("/auth/v1/token?grant_type=password", undefined, "POST", { email: identity.email, password: LOCAL.password });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data.access_token as string;
}

export async function success(path: string, token: string, method = "GET", input?: unknown, extra?: Record<string, string>) {
  const result = await request(path, token, method, input, extra);
  assert.ok(result.response.ok, `${method} ${path}: ${result.response.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

export function rpc(name: string, token: string, input: unknown = {}) {
  assert.match(name, /^[a-z_]+$/);
  return success(`/rest/v1/rpc/${name}`, token, "POST", input);
}
