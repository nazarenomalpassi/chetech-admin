import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, IDENTITIES, LOCAL } from "./config";
import { FIXTURES } from "./seed";

const bucket = "chetech-repair-files";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN4kAAAAASUVORK5CYII=", "base64");

async function client(role: "admin" | "tecnico") {
  const instance = createClient(LOCAL.apiUrl, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await instance.auth.signInWithPassword({ email: IDENTITIES.find((i) => i.role === role)!.email, password: LOCAL.password });
  assert.equal(login.error, null);
  return instance;
}

test("real SDK uploads a local private image, signs it for 60 seconds and removes only its own unlinked object", async () => {
  const admin = await client("admin");
  const path = `${FIXTURES.order}/${IDENTITIES[0].id}/${randomUUID()}.png`;
  try {
    const upload = await admin.storage.from(bucket).upload(path, new Blob([png], { type: "image/png" }), { upsert: false });
    assert.equal(upload.error, null, JSON.stringify(upload.error));
    assert.equal(upload.data?.path, path);
    const signed = await admin.storage.from(bucket).createSignedUrl(path, 60);
    assert.equal(signed.error, null, JSON.stringify(signed.error));
    assert.ok(signed.data?.signedUrl.startsWith(LOCAL.apiUrl + "/storage/v1/object/sign/"));
    const download = await fetch(signed.data!.signedUrl);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    const tampered = new URL(signed.data!.signedUrl); tampered.searchParams.set("token", "invalid");
    assert.equal((await fetch(tampered)).status, 403);
    const removed = await admin.storage.from(bucket).remove([path]);
    assert.equal(removed.error, null, JSON.stringify(removed.error));
    assert.equal((await fetch(signed.data!.signedUrl)).status, 404);
  } finally { await admin.auth.signOut({ scope: "local" }); }
});

test("storage rejects foreign owners, wrong MIME, missing orders and images over 8 MiB", async () => {
  const admin = await client("admin"), tech = await client("tecnico");
  const path = `${FIXTURES.order}/${IDENTITIES[0].id}/${randomUUID()}.png`;
  try {
    assert.equal((await tech.storage.from(bucket).upload(path, png, { contentType: "image/png" })).error?.status, 403);
    assert.equal((await admin.storage.from(bucket).upload(`${FIXTURES.order}/${IDENTITIES[1].id}/${randomUUID()}.png`, png, { contentType: "image/png" })).error?.status, 403);
    assert.equal((await admin.storage.from(bucket).upload(`${randomUUID()}/${IDENTITIES[0].id}/${randomUUID()}.png`, png, { contentType: "image/png" })).error?.status, 404);
    assert.equal((await admin.storage.from(bucket).upload(path, Buffer.from("<svg/>"), { contentType: "image/svg+xml" })).error?.status, 415);
    const big = Buffer.alloc(8388609); png.copy(big);
    assert.equal((await admin.storage.from(bucket).upload(path, big, { contentType: "image/png" })).error?.status, 413);
    assert.equal((await admin.storage.from("production-bucket").upload(path, png, { contentType: "image/png" })).error?.status, 404);
    const techPath = `${FIXTURES.order}/${IDENTITIES[1].id}/${randomUUID()}.png`;
    assert.equal((await tech.storage.from(bucket).upload(techPath, png, { contentType: "image/png" })).error, null);
    assert.equal((await tech.storage.from(bucket).createSignedUrl(techPath, 60)).error, null);
    assert.equal((await tech.storage.from(bucket).remove([techPath])).error, null);
  } finally { await admin.auth.signOut({ scope: "local" }); await tech.auth.signOut({ scope: "local" }); }
});
