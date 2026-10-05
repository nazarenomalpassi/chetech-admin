import assert from "node:assert/strict";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, IDENTITIES, LOCAL } from "./config";

test("actual Supabase SDK supports password login, REST single and RPC", async () => {
  const client = createClient(LOCAL.apiUrl, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const login = await client.auth.signInWithPassword({ email: IDENTITIES[0].email, password: LOCAL.password });
    assert.equal(login.error, null);
    const profile = await client.from("profiles").select("id,role").eq("id", IDENTITIES[0].id).single();
    assert.equal(profile.error, null);
    assert.equal(profile.data.role, "admin");
    const inbox = await client.rpc("get_workshop_inbox");
    assert.equal(inbox.error, null);
    assert.ok(inbox.data.counts);
  } finally { await client.auth.signOut({ scope: "local" }); }
});

test("actual @supabase/ssr cookies survive a second client and refresh", async () => {
  const jar = new Map<string, string>();
  const options = { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (items: { name: string; value: string }[]) => { for (const cookie of items) jar.set(cookie.name, cookie.value); } } };
  const first = createServerClient(LOCAL.apiUrl, ANON_KEY, options);
  const result = await first.auth.signInWithPassword({ email: IDENTITIES[1].email, password: LOCAL.password });
  assert.equal(result.error, null);
  assert.ok([...jar.values()].some((value) => value.length > 10), "SSR session cookie written");
  const second = createServerClient(LOCAL.apiUrl, ANON_KEY, options);
  try {
    const user = await second.auth.getUser();
    assert.equal(user.error, null);
    assert.equal(user.data.user?.id, IDENTITIES[1].id);
    const refreshed = await second.auth.refreshSession();
    assert.equal(refreshed.error, null);
    assert.notEqual(refreshed.data.session?.refresh_token, result.data.session?.refresh_token);
    const profile = await second.from("profiles").select("id,role").maybeSingle();
    assert.equal(profile.error, null);
    assert.ok(profile.data);
    assert.equal(profile.data.role, "tecnico");
  } finally { await second.auth.signOut({ scope: "local" }); }
});
