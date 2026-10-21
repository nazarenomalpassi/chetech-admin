import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { connectDatabase, type Database } from "./db";
import { IDENTITIES } from "./config";
const admin = IDENTITIES[0].id, tech = IDENTITIES[1].id;
const rpc = "select public.release_tv_board_to_sale($1,$2,$3,$4) result";
async function asUser(db: Database, actor: string, sql: string, args: unknown[] = []) {
  await db.query("savepoint op");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: actor, role: "authenticated" }), actor]);
    await db.query("set local role authenticated");
    const result = await db.query(sql, args); await db.query("reset role"); await db.query("release savepoint op");
    return result.rows[0]?.result;
  } catch (e) { await db.query("rollback to savepoint op"); throw e; }
}
const code = (expected: string) => (e: any) => e.code === expected;
async function board(db: Database, cost: number | null = 20000) {
  const id = randomUUID();
  await db.query("insert into public.tv_boards(id,brand,model,board_type,listed_price,is_active,sold_at,mercado_libre_net_amount,release_date,acquisition_cost) values($1,'RELEASE-LOCAL','Synthetic Samsung','main',200000,false,'2026-10-01T12:00:00Z',104000.25,current_date-5,$2)", [id, cost]);
  return id;
}
async function fingerprint(db: Database) {
  return (await db.query("select jsonb_build_object('settings',(select md5(jsonb_agg(to_jsonb(t) order by key)::text) from public.app_settings t),'products',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.products t),'stock',(select count(*) from public.stock_movements),'stock2',(select count(*) from public.movimientos_stock)) result")).rows[0].result;
}
async function historicalRows(db: Database) {
  const result: Array<{table:string; ids:string[]; hash:string}>=[];
  for (const table of ["sales","sale_items","sale_payments","movimientos_caja","stock_movements","movimientos_stock","tv_boards"]) {
    const row=(await db.query(`select coalesce(array_agg(id::text order by id),'{}') ids,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from public.${table} t`)).rows[0];
    result.push({table,ids:row.ids as string[],hash:String(row.hash)});
  }
  return result;
}
async function assertHistoryPreserved(db: Database, originals: Awaited<ReturnType<typeof historicalRows>>) {
  for (const original of originals) {
    const hash=(await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from public.${original.table} t where id::text=any($1::text[])`,[original.ids])).rows[0].hash;
    assert.equal(hash,original.hash,`Pre-existing ${original.table} rows changed`);
  }
}
async function sameReceiptRace() {
  const first=await connectDatabase(), second=await connectDatabase();
  try {
    const id=await board(first), args=[id,1,randomUUID(),"nx"];
    await first.query("begin"); await second.query("begin");
    const winner=await asUser(first,admin,rpc,args);
    const waiting=asUser(second,admin,rpc,args).then(result=>({result}),error=>({error}));
    await first.query("commit");
    const replay=await waiting;
    assert.ok("result" in replay); assert.equal(replay.result.saleId,winner.saleId); assert.equal(replay.result.replayed,true);
    await second.query("commit");
    assert.equal((await first.query("select count(*)::int n from public.sales where tv_board_id=$1",[id])).rows[0].n,1);
    assert.equal((await first.query("select count(*)::int n from public.movimientos_caja where referencia_tabla='sales' and referencia_id=$1",[winner.saleId])).rows[0].n,1);
    console.log("PASS two concurrent identical requests return the same sale and one cash receipt");
  } finally { await first.query("rollback"); await second.query("rollback"); await first.end(); await second.end(); }
}
async function main() {
  const db = await connectDatabase();
  try {
    if (process.argv.includes("--apply")) await db.query(readFileSync(new URL("../../supabase/migrations/20261021144948_tv_board_release_sales.sql", import.meta.url), "utf8"));
    if (process.argv.includes("--refresh-functions")) {
      const sql=readFileSync(new URL("../../supabase/migrations/20261021144948_tv_board_release_sales.sql",import.meta.url),"utf8");
      for (const [definition] of sql.matchAll(/create (?:or replace )?function [\s\S]+?\$\$;/g)) await db.query(definition.replace(/^create function/,"create or replace function"));
      const guard=sql.match(/do \$\$[\s\S]+?end \$\$;/)?.[0];
      if (!guard) throw new Error("Missing merchandise RPC entry guard");
      await db.query(guard);
      const reports=sql.match(/do \$reports\$[\s\S]+?end \$reports\$;/)?.[0];
      if (!reports) throw new Error("Missing report coverage patch");
      // The patch intentionally checks its original anchors and is applied only once.
      const definition=(await db.query("select pg_get_functiondef('public.get_reports_performance_snapshot(date,date,date,date,date,date)'::regprocedure) body")).rows[0].body;
      if (!definition.includes("sales_unknown_cost_count")) await db.query(reports);
    }
    await db.query("begin");
    const before = await fingerprint(db);
    const originals=await historicalRows(db);
    for (const method of ["nx", "mp"]) {
      const id = await board(db), op = randomUUID();
      const args = [id, 1, op, method];
      const result = await asUser(db, admin, rpc, args);
      assert.equal(result.method, method); assert.equal(result.version, 2); assert.equal(result.status, "released");
      assert.equal((await asUser(db, admin, rpc, args)).saleId, result.saleId);
      await assert.rejects(asUser(db, admin, rpc, [id, 1, op, method === "nx" ? "mp" : "nx"]), code("23514"));
      await assert.rejects(asUser(db, admin, rpc, [id, 1, randomUUID(), method]), code("40001"));
      const row = (await db.query("select s.*,b.sold_at original_sold_at,b.released_at from public.sales s join public.tv_boards b on b.id=s.tv_board_id where s.id=$1", [result.saleId])).rows[0];
      assert.equal(Number(row.subtotal), 104000.25); assert.equal(Number(row.cost_total), 20000); assert.equal(Number(row.profit_total), 84000.25);
      assert.equal(row.sold_at.toISOString(), row.released_at.toISOString()); assert.equal(row.original_sold_at.toISOString(), "2026-10-01T12:00:00.000Z");
      const item = (await db.query("select * from public.sale_items where sale_id=$1", [result.saleId])).rows;
      assert.equal(item.length, 1); assert.equal(item[0].product_id, null); assert.match(item[0].description, /Main.*RELEASE-LOCAL.*Synthetic Samsung/);
      const payments = (await db.query("select * from public.sale_payments where sale_id=$1", [result.saleId])).rows;
      assert.equal(payments.length, 1); assert.equal(payments[0].method, method);
      const cash = (await db.query("select * from public.movimientos_caja where referencia_tabla='sales' and referencia_id=$1", [result.saleId])).rows;
      assert.equal(cash.length, 1); assert.equal(cash[0].medio_pago, method); assert.equal(Number(cash[0].monto),104000.25);
      for (const sql of ["update public.sales set subtotal=1 where id=$1", "delete from public.sales where id=$1", "delete from public.sale_items where sale_id=$1", "delete from public.sale_payments where sale_id=$1", "delete from public.movimientos_caja where referencia_tabla='sales' and referencia_id=$1", "select public.delete_sale_atomic($1) result"]) {
        await assert.rejects(asUser(db, admin, sql, [result.saleId]), code("23514"));
      }
      await assert.rejects(asUser(db, admin, "update public.tv_boards set acquisition_cost=0 where id=$1", [id]), code("23514"));
      await assert.rejects(asUser(db, admin, "select public.save_sale_atomic($1,now(),'[]'::jsonb,'[]'::jsonb,null) result", [result.saleId]));
      console.log(`PASS ${method}: one net sale/payment/cash, stable replay, immutable origin, original date and stock preserved`);
    }
    const unknown = await board(db, null);
    const unknownResult = await asUser(db, admin, rpc, [unknown,1,randomUUID(),"nx"]);
    const unknownSale = (await db.query("select cost_total,profit_total from public.sales where id=$1",[unknownResult.saleId])).rows[0];
    assert.equal(unknownSale.cost_total,null); assert.equal(unknownSale.profit_total,null);
    const zero = await board(db,0);
    const zeroResult = await asUser(db,admin,rpc,[zero,1,randomUUID(),"mp"]);
    assert.equal(Number((await db.query("select profit_total from public.sales where id=$1",[zeroResult.saleId])).rows[0].profit_total),104000.25);
    const report=await asUser(db,admin,"select public.get_reports_performance_snapshot(current_date,current_date+1,current_date,current_date+1,current_date-1,current_date) result");
    assert.ok(report.metrics.selected.sales_unknown_cost_count>=1,"SQL reports must identify unknown board costs");
    const nonInventory=report.rankings.categories.find((row: any)=>row.label==="Sin producto de inventario");
    assert.ok(nonInventory?.unknown_cost_count>=1,"SQL ranking must preserve unknown cost coverage and non-inventory origin");
    const pending = await board(db);
    await assert.rejects(asUser(db, tech, rpc, [pending,1,randomUUID(),"nx"]),code("42501"));
    await assert.rejects(asUser(db, admin, rpc, [pending,1,randomUUID(),"efectivo"]),code("23514"));
    await assert.rejects(asUser(db, admin, "select public.tv_board_sale_transition($1,1,$2,'confirm_release','') result",[pending,randomUUID()]),code("23514"));
    const claim = await asUser(db,admin,"select public.tv_board_sale_transition($1,1,$2,'start_claim','Held') result",[pending,randomUUID()]);
    await assert.rejects(asUser(db,admin,rpc,[pending,claim.version,randomUUID(),"nx"]),code("23514"));
    console.log("PASS unknown cost stays unknown; real zero cost is distinct; role/claim/legacy endpoint/destination guards");
    await db.query("create function pg_temp.fail_release_insert() returns trigger language plpgsql as $$ begin raise exception 'Synthetic release insert failure'; end $$");
    for (const table of ["sales","sale_items","sale_payments","movimientos_caja","tv_board_sale_events","audit_logs"]) {
      const atomic=await board(db), op=randomUUID();
      await db.query(`create trigger fail_release_insert before insert on public.${table} for each row execute function pg_temp.fail_release_insert()`);
      await assert.rejects(asUser(db,admin,rpc,[atomic,1,op,"nx"]),/Synthetic release insert failure/);
      assert.equal((await db.query("select released_at from public.tv_boards where id=$1",[atomic])).rows[0].released_at,null);
      assert.equal((await db.query("select count(*)::int n from public.sales where tv_board_id=$1",[atomic])).rows[0].n,0);
      assert.equal((await db.query("select count(*)::int n from private.tv_board_release_receipts where operation_id=$1",[op])).rows[0].n,0);
      await db.query(`drop trigger fail_release_insert on public.${table}`);
    }
    const legacy=randomUUID();
    await db.query("insert into public.tv_boards(id,brand,model,board_type,is_active,sold_at,mercado_libre_net_amount,released_at) values($1,'LEGACY-RELEASE','Already handled','main',false,now()-interval '1 month',75000,now()-interval '2 days')",[legacy]);
    await assert.rejects(asUser(db,admin,rpc,[legacy,1,randomUUID(),"nx"]),code("23514"));
    assert.equal((await db.query("select count(*)::int n from public.sales where tv_board_id=$1",[legacy])).rows[0].n,0);
    assert.deepEqual(await fingerprint(db),before);
    await assertHistoryPreserved(db,originals);
    console.log("PASS failure at each of six insert stages rolls back all projections; legacy releases never backfill; cash base and stock untouched");
    await db.query("rollback");
    // Sequence gaps in isolated staging are intentional; never reset a shared sequence backwards.
    await db.query("select setval('public.sale_number_seq',greatest((select last_value from public.sale_number_seq),10000),true)");
    const number=(await db.query("select public.generate_sale_number() value")).rows[0].value;
    assert.match(number,/^V-\d{5,}$/);
    console.log("PASS sale numbers above 9999 are preserved without truncation");
    await sameReceiptRace();
  } finally { await db.query("rollback"); await db.end(); }
}
main().catch(e=>{ console.error(e); process.exitCode=1; });
