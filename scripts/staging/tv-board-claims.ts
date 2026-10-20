import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";

const admin = IDENTITIES[0].id;
const tech = IDENTITIES[1].id;
const rpc = "select public.tv_board_sale_transition($1,$2,$3,$4,$5) result";

async function asUser(db: Database, actor: string, sql: string, args: unknown[] = []) {
  await db.query("savepoint operation");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: actor, role: "authenticated" }), actor]);
    await db.query("set local role authenticated");
    const result = await db.query(sql, args);
    await db.query("reset role");
    await db.query("release savepoint operation");
    return result.rows[0]?.result;
  } catch (error) { await db.query("rollback to savepoint operation"); throw error; }
}

async function insertBoard(db: Database, sold = true) {
  const id = randomUUID();
  await db.query("insert into public.tv_boards(id,brand,model,board_type,listed_price,is_active,sold_at,mercado_libre_net_amount,release_date,acquisition_cost,sale_notes) values($1,'CLAIMS-LOCAL','Synthetic TV','main',200000,$2,$3,$4,current_date-5,20000,'Original sale notes')", [id, !sold, sold ? "2026-10-01T12:00:00Z" : null, sold ? 104000.25 : null]);
  return id;
}

function isCode(code: string) { return (error: any) => error.code === code; }

async function snapshot(db: Database) {
  return (await db.query("select jsonb_build_object('cash',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.movimientos_caja t),'settings',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by key)::text,'')) from public.app_settings t),'sales',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.sales t),'products',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.products t)) result")).rows[0].result;
}

async function race(firstKind: "start_claim" | "confirm_release") {
  const first = await connectDatabase();
  const second = await connectDatabase();
  try {
    const id = await insertBoard(first);
    await first.query("begin");
    await first.query("select id from public.tv_boards where id=$1 for update", [id]);
    await second.query("begin");
    const loserKind = firstKind === "start_claim" ? "confirm_release" : "start_claim";
    // Attach rejection handling immediately while the second session waits on the row lock.
    const loser = asUser(second, admin, rpc, [id, 1, randomUUID(), loserKind, "Concurrent attempt"])
      .then(() => ({ code: "unexpected-success" }), (error: any) => ({ code: error.code }));
    const winner = await asUser(first, admin, rpc, [id, 1, randomUUID(), firstKind, "Concurrent winner"]);
    assert.equal(winner.status, firstKind === "start_claim" ? "claim_open" : "released");
    await first.query("commit");
    assert.equal((await loser).code, "40001");
    await second.query("rollback");
    const state = (await first.query("select claim_status,released_at,financial_version from public.tv_boards where id=$1", [id])).rows[0];
    assert.equal(state.financial_version, 2);
    assert.equal(state.claim_status, firstKind === "start_claim" ? "open" : "none");
    assert.equal(Boolean(state.released_at), firstKind === "confirm_release");
    assert.equal((await first.query("select count(*)::int n from public.tv_board_sale_events where board_id=$1", [id])).rows[0].n, 1);
    if (firstKind === "start_claim") {
      await first.query("begin");
      await asUser(first, admin, rpc, [id, 2, randomUUID(), "cancel_sale", "Synthetic race fixture closed"]);
      await first.query("commit");
    }
    console.log(`PASS concurrent ${firstKind} wins once; competing transition rejected`);
  } finally {
    await first.query("rollback"); await second.query("rollback");
    await first.end(); await second.end();
  }
}

async function main() {
  const db = await connectDatabase();
  try {
    if (process.argv.includes("--apply")) await db.query(readFileSync(new URL("../../supabase/migrations/20261020150731_tv_board_claims.sql", import.meta.url), "utf8"));
    if (process.argv.includes("--refresh-functions")) {
      const sql = readFileSync(new URL("../../supabase/migrations/20261020150731_tv_board_claims.sql", import.meta.url), "utf8");
      for (const [definition] of sql.matchAll(/create function [\s\S]+?\$\$;/g)) await db.query(definition.replace(/^create function/, "create or replace function"));
      await db.query("revoke all on public.tv_board_sale_events from service_role; grant select on public.tv_board_sale_events to service_role");
    }
    await db.query("begin");
    const before = await snapshot(db);
    const id = await insertBoard(db);
    const unsold = await insertBoard(db, false);
    const original = (await db.query("select jsonb_build_object('soldAt',sold_at,'net',mercado_libre_net_amount,'price',listed_price,'cost',acquisition_cost,'releaseDate',release_date,'notes',sale_notes) result from public.tv_boards where id=$1", [id])).rows[0].result;
    await assert.rejects(asUser(db, admin, "update public.tv_boards set released_at=now() where id=$1", [id]), isCode("42501"));
    await assert.rejects(asUser(db, admin, "insert into public.tv_boards(brand,model,board_type,released_at) values('Bypass','Release','main',now())"), isCode("42501"));
    assert.equal((await db.query("select has_table_privilege('service_role','public.tv_board_sale_events','UPDATE,DELETE,TRUNCATE') allowed")).rows[0].allowed, false);
    const op = randomUUID();
    const start = [id, 1, op, "start_claim", "Cliente compro una placa incorrecta"];
    const claimed = await asUser(db, admin, rpc, start);
    assert.equal(claimed.status, "claim_open"); assert.equal(claimed.version, 2);
    assert.equal((await asUser(db, admin, rpc, start)).replayed, true);
    await assert.rejects(asUser(db, admin, rpc, [...start.slice(0, 4), "Changed retry"]), isCode("23514"));
    await assert.rejects(asUser(db, admin, rpc, [id, 1, randomUUID(), "confirm_release", ""]), isCode("40001"));
    await assert.rejects(asUser(db, admin, rpc, [id, 2, randomUUID(), "confirm_release", ""]), isCode("23514"));
    await assert.rejects(asUser(db, admin, rpc, [id, 2, randomUUID(), "start_claim", ""]), isCode("23514"));
    await assert.rejects(asUser(db, admin, rpc, [unsold, 1, randomUUID(), "start_claim", ""]), isCode("23514"));
    await assert.rejects(asUser(db, tech, rpc, start), isCode("42501"));
    assert.equal(await asUser(db, tech, "select count(*)::int result from public.tv_board_sale_events"), 0);
    await db.query("savepoint anonymous");
    await db.query("set local role anon");
    await assert.rejects(db.query(rpc, start), isCode("42501"));
    await db.query("rollback to savepoint anonymous");
    await assert.rejects(asUser(db, admin, "update public.tv_boards set claim_status='none' where id=$1", [id]), isCode("42501"));
    await assert.rejects(asUser(db, admin, "update public.tv_boards set released_at=now() where id=$1", [id]), isCode("42501"));
    await assert.rejects(asUser(db, admin, "update public.tv_boards set mercado_libre_net_amount=1 where id=$1", [id]), isCode("23514"));
    await assert.rejects(asUser(db, admin, "update public.tv_boards set sold_at=null where id=$1", [id]), isCode("23514"));
    await assert.rejects(asUser(db, admin, "delete from public.tv_boards where id=$1", [id]), isCode("23514"));
    await assert.rejects(asUser(db, admin, "delete from public.tv_board_sale_events where board_id=$1", [id]), isCode("42501"));
    assert.equal((await db.query("select count(*)::int n from public.tv_board_sale_events where board_id=$1", [id])).rows[0].n, 1);
    console.log("PASS claim/retry/actor guards and direct-write protection; unreleased amount held once");

    const resumed = await asUser(db, admin, rpc, [id, 2, randomUUID(), "resume_sale", "Contrarreclamo favorable"]);
    assert.equal(resumed.status, "pending_release"); assert.equal(resumed.version, 3);
    await assert.rejects(asUser(db, admin, "update public.tv_boards set released_at=now() where id=$1", [id]), isCode("42501"));
    assert.equal((await db.query("select released_at from public.tv_boards where id=$1", [id])).rows[0].released_at, null);
    const reopened = await asUser(db, admin, rpc, [id, 3, randomUUID(), "start_claim", "Segundo reclamo"]);
    const cancelled = await asUser(db, admin, rpc, [id, reopened.version, randomUUID(), "cancel_sale", "Venta cancelada, sin cobro"]);
    assert.equal(cancelled.status, "cancelled");
    await assert.rejects(asUser(db, admin, rpc, [id, cancelled.version, randomUUID(), "confirm_release", ""]), isCode("23514"));
    const preserved = (await db.query("select jsonb_build_object('soldAt',sold_at,'net',mercado_libre_net_amount,'price',listed_price,'cost',acquisition_cost,'releaseDate',release_date,'notes',sale_notes) result from public.tv_boards where id=$1", [id])).rows[0].result;
    assert.deepEqual(preserved, original);
    assert.equal((await db.query("select is_active from public.tv_boards where id=$1", [id])).rows[0].is_active, false);
    const releasedId = await insertBoard(db);
    const release = [releasedId, 1, randomUUID(), "confirm_release", ""];
    assert.equal((await asUser(db, admin, rpc, release)).status, "released");
    assert.equal((await asUser(db, admin, rpc, release)).replayed, true);
    await assert.rejects(asUser(db, admin, rpc, [releasedId, 2, randomUUID(), "start_claim", ""]), isCode("23514"));
    assert.deepEqual(await snapshot(db), before);
    console.log("PASS restore/reopen/cancel preserves original sale; manual release; no cash/settings/stock/sales changes");

    await db.query("create function pg_temp.reject_tv_event() returns trigger language plpgsql as $$ begin raise exception 'Synthetic event failure'; end $$");
    await db.query("create trigger claims_local_event_failure before insert on public.tv_board_sale_events for each row when(new.notes='SIMULATE-LOCAL-FAILURE') execute function pg_temp.reject_tv_event()");
    const failedId = await insertBoard(db);
    await assert.rejects(asUser(db, admin, rpc, [failedId, 1, randomUUID(), "start_claim", "SIMULATE-LOCAL-FAILURE"]), isCode("P0001"));
    const failed = (await db.query("select claim_status,financial_version from public.tv_boards where id=$1", [failedId])).rows[0];
    assert.deepEqual(failed, { claim_status: "none", financial_version: 1 });
    assert.deepEqual(await snapshot(db), before);
    console.log("PASS event failure rolls back claim state/version atomically");
    await db.query("rollback");
    await race("start_claim");
    await race("confirm_release");
    await db.query("notify pgrst,'reload schema'");
  } finally { await db.query("rollback"); await db.end(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
