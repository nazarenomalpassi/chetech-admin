import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LOCAL, ANON_KEY, assertLocalUrl, nextEnvironment, signJwt, verifyJwt } from "./config";

test("database and HTTP guards refuse production, DNS, credentials, and alternate database", () => {
  for (const url of ["https://example.supabase.co", "http://localhost:54341", "http://0.0.0.0:54341", "http://user@127.0.0.1:54341", "http://127.0.0.1:54341/?redirect=external"]) {
    assert.throws(() => assertLocalUrl(url));
  }
  assert.throws(() => assertLocalUrl("postgresql://postgres@127.0.0.1:54339/postgres", "database"));
  assert.equal(assertLocalUrl(LOCAL.databaseUrl, "database").hostname, "127.0.0.1");
});

test("JWT validation rejects expired tokens and privileged database roles", () => {
  assert.equal(verifyJwt(ANON_KEY).role, "anon");
  const claims = { iss: LOCAL.apiUrl + "/auth/v1", aud: "authenticated", role: "anon", exp: 1 };
  assert.throws(() => verifyJwt(signJwt(claims)));
  assert.throws(() => verifyJwt(signJwt({ ...claims, exp: 2100000000, role: "service_role" })));
  assert.throws(() => verifyJwt(signJwt({ ...claims, exp: 2100000000, role: "postgres" })));
});

test("Next environment blocks inherited production Supabase and fiscal credentials", () => {
  const inherited = { NEXT_PUBLIC_SUPABASE_URL: "https://production.invalid", SUPABASE_SERVICE_ROLE_KEY: "DO-NOT-USE", ARCA_PRODUCTION_ENABLED: "true", ARCA_PROD_PRIVATE_KEY_PEM: "DO-NOT-USE" };
  const env = { ...inherited, ...nextEnvironment() };
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, LOCAL.apiUrl);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "");
  assert.equal(env.ARCA_PRODUCTION_ENABLED, "false");
  assert.equal(env.ARCA_PROD_PRIVATE_KEY_PEM, "");
});

test("idempotent setup completes without holding unread upstream response bodies", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url)), "scripts/staging/cli.ts", "setup"], { cwd: root, encoding: "utf8", timeout: 15000 });
  assert.match(output, /PostgREST ready/);
});

test("Next's own env loader preserves explicit staging overrides over .env.local", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const source = `const assert = require('node:assert/strict');
    Object.assign(process.env, ${JSON.stringify(nextEnvironment())});
    require('@next/env').loadEnvConfig(process.cwd(), true, {info(){},error(){}});
    assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, ${JSON.stringify(LOCAL.apiUrl)});
    assert.equal(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ${JSON.stringify(ANON_KEY)});
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, '');
    assert.equal(process.env.ARCA_PRODUCTION_ENABLED, 'false');
    console.log('Staging overrides preserved');`;
  const output = execFileSync(process.execPath, ["-e", source], { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.equal(output.trim(), "Staging overrides preserved");
});
