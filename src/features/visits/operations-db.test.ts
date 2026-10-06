import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { Client } = createRequire(import.meta.url)("pg");
const connectionString = process.env.CHETECH_OPERATIONS_TEST_DB;
const admin = "11111111-1111-4111-8111-111111111111";
const tech = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444";
const accounts = [{ method: "efectivo", expected: 100, physical: 90, difference: -10, reason: "Faltante verificado" }, { method: "nx", expected: 20, physical: 20, difference: 0, reason: "" }, { method: "mp", expected: 30, physical: 30, difference: 0, reason: "" }];

describe.skipIf(!connectionString)("operations migration on disposable local Postgres", () => {
  let client: InstanceType<typeof Client>;
  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/operations_test") throw new Error("Only a disposable local operations_test database is permitted");
    client = new Client({ connectionString });
    await client.connect();
    await client.query(`
      create schema auth; create schema extensions;
      create role authenticated; create role anon; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
      grant usage on schema auth to authenticated;
      create table public.profiles(id uuid primary key, full_name text, role text);
      insert into public.profiles values ('${admin}', 'Admin', 'admin'), ('${tech}', 'Tecnico', 'tecnico');
      grant select on public.profiles to authenticated;
      create table public.repair_access_customers(id uuid primary key, full_name text, phone text, dni text, address text);
      create table public.repair_access_devices(id uuid primary key, device_type text, brand text, model text, serial_number text, accessory_details text);
      insert into public.repair_access_customers values ('${orderId}', 'Cliente Historico', '341', '', 'Local');
      insert into public.repair_access_devices values ('${orderId}', 'TV', 'BGH', 'Main', 'SERIE', 'Cable');
      create table public.repair_access_orders(id uuid primary key, repair_number text, customer_id uuid, device_id uuid, intake_date date, issue_reported text, status text);
      insert into public.repair_access_orders values ('${orderId}', 'REP-000001', '${orderId}', '${orderId}', '2026-10-01', 'Sin imagen', 'ingresado');
    `);
    for (const file of ["20260708_visits.sql", "20260605_repair_outsourcings.sql", "20260424_tv_boards.sql"]) {
      await client.query(await readFile(path.resolve("supabase/migrations", file), "utf8"));
    }
    await client.query("alter table public.tv_boards add column sold_at timestamptz, add column release_date date, add column released_at timestamptz, add column mercado_libre_net_amount numeric, add column sale_notes text");
    await client.query(await readFile(path.resolve("supabase/migrations/20261005194657_operations_workflow_and_reconciliation.sql"), "utf8"));
    await client.query(await readFile(path.resolve("supabase/migrations/20261005201849_operations_reconciliation_amendments_and_history.sql"), "utf8"));
    await client.query("grant select on repair_outsourcings, repair_access_orders, repair_access_customers, repair_access_devices to authenticated");
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });

  function addVisit(timeFrom: string, timeTo: string, technician = tech, status = "pendiente") {
    return client.query("insert into public.visits(customer_name, customer_phone, address, visit_date, time_from, time_to, reason, technician_id, status) values ('Cliente', '341', 'Local', '2026-10-05', $1, $2, 'Revision', $3, $4) returning id", [timeFrom, timeTo, technician, status]);
  }

  it("rejects concurrent bookings, allows adjacency, different technicians and cancelled slots", async () => {
    await addVisit("09:00", "10:00");
    await expect(addVisit("09:30", "10:30")).rejects.toMatchObject({ code: "23P01" });
    await addVisit("10:00", "11:00");
    await addVisit("09:30", "10:30", admin);
    await addVisit("09:30", "10:30", tech, "cancelada");
    const result = await Promise.allSettled([addVisit("12:00", "13:00"), addVisit("12:30", "13:30")]);
    expect(result.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((entry) => entry.status === "rejected")).toHaveLength(1);
  });
  it("checks reactivation, rescheduling and invalid intervals in the database", async () => {
    const visit = await addVisit("09:45", "10:15", tech, "cancelada");
    await expect(client.query("update visits set status='confirmada' where id=$1", [visit.rows[0].id])).rejects.toMatchObject({ code: "23P01" });
    await expect(addVisit("15:00", "14:00")).rejects.toMatchObject({ code: "23514" });
  });
  it("makes restored new-visit retries unique at the database boundary", async () => {
    const create = () => client.query("insert into visits(customer_name,customer_phone,address,visit_date,time_from,time_to,reason,client_operation_id) values ('Cliente','341','Local','2026-10-06','09:00','10:00','Revision',$1)", [id]);
    await create(); await expect(create()).rejects.toMatchObject({ code: "23505" });
  });
  it("keeps REP links, unknown costs and dispatch history", async () => {
    await client.query("insert into repair_outsourcings(id, repair_access_order_id, workshop_name, sent_at, promised_at, expected_cost) values ($1,$2,'Taller','2026-10-05','2026-10-06',null)", [id, orderId]);
    await expect(client.query("update repair_outsourcings set promised_at='2026-10-04' where id=$1", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(client.query("update repair_outsourcings set actual_cost=-1 where id=$1", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(client.query("delete from repair_access_orders where id=$1", [orderId])).rejects.toMatchObject({ code: "23503" });
    await client.query("update repair_outsourcings set status='retirado', retrieved_at='2026-10-07', actual_cost=0 where id=$1", [id]);
    const { rows } = await client.query("select expected_cost, actual_cost, sent_at::text, repair_access_order_id from repair_outsourcings where id=$1", [id]);
    expect(rows[0]).toMatchObject({ expected_cost: null, actual_cost: "0.00", sent_at: "2026-10-05", repair_access_order_id: orderId });
  });
  it("writes a single immutable audited close and denies technician access", async () => {
    await client.query("set role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await client.query("insert into operations_cash_reconciliations(id,business_date,accounts,created_by) values ($1,'2026-10-05',$2,$3)", [id, JSON.stringify(accounts), admin]);
    await expect(client.query("insert into operations_cash_reconciliations(id,business_date,accounts,created_by) values (gen_random_uuid(),'2026-10-05',$1,$2)", [JSON.stringify(accounts), admin])).rejects.toMatchObject({ code: "23505" });
    await expect(client.query("update operations_cash_reconciliations set observations='overwrite'")).rejects.toMatchObject({ code: "42501" });
    await expect(client.query("delete from operations_cash_reconciliations")).rejects.toMatchObject({ code: "42501" });
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [tech]);
    expect((await client.query("select * from operations_cash_reconciliations")).rows).toHaveLength(0);
    await expect(client.query("insert into operations_cash_reconciliations(id,business_date,accounts,created_by) values (gen_random_uuid(),'2026-10-06',$1,$2)", [JSON.stringify(accounts), tech])).rejects.toMatchObject({ code: "42501" });
    await client.query("reset role");
    const { rows } = await client.query("select created_by, accounts from operations_cash_reconciliations");
    expect(rows[0].created_by).toBe(admin);
    expect(rows[0].accounts).toEqual(accounts);
  });
  it("rejects missing accounts, duplicate accounts and unjustified differences even via direct SQL", async () => {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    for (const invalid of [accounts.slice(1), [accounts[0], accounts[0], accounts[2]], accounts.map((account) => ({ ...account, reason: "" }))]) {
      await expect(client.query("insert into operations_cash_reconciliations(id,business_date,accounts,created_by) values (gen_random_uuid(),'2026-10-06',$1,$2)", [JSON.stringify(invalid), admin])).rejects.toMatchObject({ code: "23514" });
    }
  });

  const reopened = "55555555-5555-4555-8555-555555555555";
  const corrected = accounts.map((account) => account.method === "efectivo" ? { ...account, physical: 95, difference: -5, reason: "Monedas verificadas" } : account);
  function amend(database: InstanceType<typeof Client>, revisionId: string, supersedes: string | null, kind: string, snapshot = accounts, reason = "Correccion documentada") {
    return database.query("insert into operations_cash_reconciliation_amendments(id,root_id,supersedes_id,kind,reason,accounts,created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id", [revisionId, id, supersedes, kind, reason, JSON.stringify(snapshot), admin]);
  }
  it("appends a reasoned reopening without changing the original count", async () => {
    await expect(amend(client, reopened, null, "reopened", accounts, "")).rejects.toMatchObject({ code: "23514" });
    await expect(amend(client, reopened, null, "reopened", corrected)).rejects.toMatchObject({ code: "23514" });
    await amend(client, reopened, null, "reopened");
    expect((await client.query("select accounts from operations_cash_reconciliations where id=$1", [id])).rows[0].accounts).toEqual(accounts);
  });
  it("rejects historical expected-balance tampering and concurrent correction forks", async () => {
    const tampered = corrected.map((account) => account.method === "efectivo" ? { ...account, expected: 999, difference: -904 } : account);
    await expect(amend(client, "66666666-6666-4666-8666-666666666666", reopened, "closed", tampered)).rejects.toMatchObject({ code: "23514" });
    const competitor = new Client({ connectionString }); await competitor.connect();
    try {
      await competitor.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
      const outcomes = await Promise.allSettled([
        amend(client, "66666666-6666-4666-8666-666666666666", reopened, "closed", corrected),
        amend(competitor, "77777777-7777-4777-8777-777777777777", reopened, "closed", corrected)
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      expect((await client.query("select accounts from operations_cash_reconciliations where id=$1", [id])).rows[0].accounts).toEqual(accounts);
    } finally { await competitor.end(); }
  });
  it("keeps revisions immutable and denies technicians even on direct SQL", async () => {
    await expect(client.query("update operations_cash_reconciliation_amendments set reason='rewrite'")).rejects.toMatchObject({ code: "23514" });
    await client.query("set role authenticated");
    try {
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [tech]);
      expect((await client.query("select * from operations_cash_reconciliation_amendments")).rows).toHaveLength(0);
      await expect(amend(client, "88888888-8888-4888-8888-888888888888", null, "reopened")).rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("reset role"); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]); }
  });
  it("paginates more than 200 outsourced records with literal search and full filtered counts", async () => {
    await client.query(`insert into repair_outsourcings(repair_access_order_id,workshop_name,sent_at,retrieved_at,status,created_at)
      select $1,'Taller historico','2026-10-05','2026-10-06','retirado', timestamptz '2026-10-05T10:00:00Z' + n * interval '1 minute' from generate_series(1,620) n`, [orderId]);
    const call = async (page: number) => (await client.query("select get_operations_outsourcings_page('Historico','todos','2026-10-05','2026-10-11',$1) as result", [page])).rows[0].result;
    const page = await call(13);
    expect(page.total).toBe(621); expect(page.records).toHaveLength(25); expect(page.page).toBe(13);
    expect(page.summary.total).toBe(621);
    const all = new Set<string>();
    for (let number = 1; number <= 25; number++) for (const row of (await call(number)).records) all.add(row.id);
    expect(all.size).toBe(621);
    expect((await call(999)).page).toBe(25);
    expect((await client.query("select get_operations_outsourcings_page('%','todos',null,null,1) as result")).rows[0].result.total).toBe(0);
  });
  it("denies technicians access to the outsourcing history RPC", async () => {
    await client.query("set role authenticated");
    try {
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [tech]);
      await expect(client.query("select get_operations_outsourcings_page()" )).rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("reset role"); }
  });
});
