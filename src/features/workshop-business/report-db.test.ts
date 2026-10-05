import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const { Client } = createRequire(import.meta.url)("pg");
const connectionString = process.env.CHETECH_WORKSHOP_REPORT_TEST_DB;
const admin = "10000000-0000-4000-8000-000000000001";
const techA = "10000000-0000-4000-8000-000000000002";
const techB = "10000000-0000-4000-8000-000000000003";
const order = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const version = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe.skipIf(!connectionString)("synthetic workshop business aggregates and RLS", () => {
  let db: InstanceType<typeof Client>;
  let today: string;
  let from: string;
  let to: string;
  let basePage: { orders: unknown; total: number; pageSize: number; nextCursor: unknown };
  let baseFunctionOid: number;
  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/workshop_report_test") throw new Error("Requires a fresh disposable local workshop_report_test database");
    db = new Client({ connectionString }); await db.connect();
    await db.query(`
      create schema auth; create role authenticated; create role anon; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table profiles(id uuid primary key, full_name text, role text);
      insert into profiles values ('${admin}','Creador admin','admin'),('${techA}','Tecnico A','tecnico'),('${techB}','Tecnico B','tecnico');
      grant select on profiles to authenticated;
      create table repair_access_orders(id uuid primary key, intake_date date, technician_id uuid, technician_name text, created_by uuid,
        status text, delivered_at timestamptz, final_amount numeric default 0, budget_amount numeric, budget_revision integer default 0,
        approval_status text default 'legacy', used_parts text, import_source text, has_warranty boolean default false,
        warranty_until date, warranty_requires_review boolean default false, is_paid boolean default false);
      create table repair_budget_versions(id uuid primary key, order_id uuid, revision integer, amount numeric);
      create table repair_customer_decisions(id uuid default gen_random_uuid(), order_id uuid, budget_version_id uuid, decision text, created_at timestamptz default now());
      create table repair_part_requests(id uuid default gen_random_uuid(), order_id uuid, quantity integer, received_quantity integer,
        installed_quantity integer, unit_cost numeric, status text);
      create table repair_outsourcings(id uuid default gen_random_uuid(), repair_access_order_id uuid, status text, actual_cost numeric);
      create table repairs(id uuid primary key, repair_access_order_id uuid, final_price numeric);
      create table repair_payments(id uuid primary key, repair_id uuid, amount numeric, payment_date date default (now() at time zone 'America/Argentina/Buenos_Aires')::date);
      create table repair_access_payments(id uuid default gen_random_uuid(), repair_order_id uuid, amount numeric, legacy_repair_payment_id uuid, voided_at timestamptz, payment_date date default (now() at time zone 'America/Argentina/Buenos_Aires')::date);
      create table expenses(id uuid default gen_random_uuid(), repair_order_id uuid, part_request_id uuid, amount numeric, is_voided boolean default false, impacts_cash boolean default true);
      create table invoice_payments(id uuid default gen_random_uuid(), amount numeric);
      do $$ declare t text; begin foreach t in array array['repair_access_orders','repair_budget_versions','repair_customer_decisions','repair_part_requests','repair_outsourcings','repairs','repair_payments','repair_access_payments','expenses'] loop
        execute format('alter table public.%I enable row level security',t);
        execute format('grant select on public.%I to authenticated',t);
        execute format('create policy report_admin_select on public.%I for select to authenticated using ((select role from public.profiles where id=auth.uid())=''admin'')',t);
      end loop; end $$;
      insert into repair_access_orders(id,intake_date,technician_id,created_by,status,final_amount,budget_revision,approval_status) values
        ('${order(1)}',(now() at time zone 'America/Argentina/Buenos_Aires')::date-10,'${techA}','${admin}','en_reparacion',1000,2,'accepted'),
        ('${order(2)}',(now() at time zone 'America/Argentina/Buenos_Aires')::date-20,'${techA}','${admin}','en_pruebas',500,2,'accepted'),
        ('${order(3)}',(now() at time zone 'America/Argentina/Buenos_Aires')::date-30,'${techB}','${techA}','retirado',300,0,'legacy'),
        ('${order(4)}',(now() at time zone 'America/Argentina/Buenos_Aires')::date-40,null,'${admin}','presupuestado_rechazado',null,1,'rejected'),
        ('${order(5)}',(now() at time zone 'America/Argentina/Buenos_Aires')::date-80,'${techB}','${admin}','en_revision',9999,0,'legacy');
      update repair_access_orders set delivered_at=now(),has_warranty=true,warranty_until=(now() at time zone 'America/Argentina/Buenos_Aires')::date+10,is_paid=true where id='${order(3)}';
      update repair_access_orders set budget_amount=700 where id='${order(4)}';
      insert into repair_budget_versions values ('${version(1)}','${order(1)}',1,900),('${version(2)}','${order(1)}',2,1000),('${version(3)}','${order(2)}',1,500),('${version(4)}','${order(4)}',1,700);
      insert into repair_customer_decisions(order_id,budget_version_id,decision) values ('${order(1)}','${version(1)}','accepted'),('${order(1)}','${version(2)}','accepted'),('${order(2)}','${version(3)}','accepted'),('${order(4)}','${version(4)}','rejected');
      insert into repair_part_requests(order_id,quantity,received_quantity,installed_quantity,unit_cost,status) values
        ('${order(1)}',2,2,2,100,'installed'),('${order(1)}',5,0,0,500,'ordered'),('${order(2)}',2,1,1,null,'received'),('${order(3)}',1,1,1,0,'installed');
      insert into repair_outsourcings(repair_access_order_id,status,actual_cost) values ('${order(1)}','retirado',50),('${order(2)}','retirado',null),('${order(3)}','cancelado',999);
      insert into repairs values ('${version(10)}','${order(1)}',1000);
      insert into repair_payments(id,repair_id,amount) values ('${version(11)}','${version(10)}',200),('${version(12)}','${version(10)}',100);
      insert into repair_access_payments(repair_order_id,amount,legacy_repair_payment_id,voided_at) values
        ('${order(1)}',100,null,null),('${order(1)}',40,null,now()),('${order(1)}',200,'${version(11)}',null),('${order(1)}',100,'${version(12)}',null),
        ('${order(2)}',100,null,null),('${order(4)}',20,null,null),('${order(5)}',9999,null,null);
      insert into expenses(repair_order_id,part_request_id,amount,is_voided,impacts_cash) values
        ('${order(1)}','${version(99)}',1000,false,true),('${order(2)}',null,50,false,true),('${order(4)}',null,90,false,false),('${order(1)}',null,999,true,true);
      insert into invoice_payments(amount) values (9999);
    `);
    const dates = (await db.query("select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text as today, ((now() at time zone 'America/Argentina/Buenos_Aires')::date-40)::text as from, ((now() at time zone 'America/Argentina/Buenos_Aires')::date-10)::text as to")).rows[0];
    today = dates.today; from = dates.from; to = dates.to;
    await db.query(await readFile(path.resolve("supabase/migrations/20261005210805_workshop_business_report_read.sql"), "utf8"));
    await db.query(`
      create schema private;
      create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
      create function private.can_access_operations() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','tecnico')) $$;
      grant usage on schema private to authenticated;
      create table repair_access_customers(id uuid primary key, full_name text, phone text, alternate_phone text);
      create table repair_access_devices(id uuid primary key, device_type text, brand text, model text, serial_number text);
      alter table repair_access_orders add column customer_id uuid default '${version(50)}', add column device_id uuid default '${version(51)}',
        add column created_at timestamptz default now(), add column next_action_date date,
        add column customer_user_id uuid, add column repair_number text default 'REP-TEST', add column legacy_order_number text,
        add column issue_reported text, add column technical_diagnosis text, add column budget_detail text, add column paid_at timestamptz;
      alter table profiles add column email text, add column phone text;
      insert into repair_access_customers(id,full_name) values ('${version(50)}','Cliente sintetico');
      insert into repair_access_devices(id,device_type) values ('${version(51)}','TV');
      create function public.get_technician_repair_orders(uuid) returns table(payload jsonb) language sql stable as $$ select jsonb_build_object('id',$1,'final_amount',null,'budget_amount',null,'is_paid',false) $$;
    `);
    await db.query(await readFile(path.resolve("supabase/migrations/20261005200911_workshop_read_pages.sql"), "utf8"));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    basePage = (await db.query("select workshop_read_page(p_limit=>1) as page")).rows[0].page;
    baseFunctionOid = (await db.query("select 'private.workshop_read_page(text,text,text,text,timestamptz,uuid,integer)'::regprocedure::oid as oid")).rows[0].oid;
    const amendment = process.env.CHETECH_TEST_READ_AMENDMENT;
    if (amendment !== "base") await db.query(await readFile(path.resolve("supabase/migrations/20261005211929_workshop_read_actual_collections.sql"), "utf8"));
    if (process.env.CHETECH_TEST_QUOTE_AMOUNT_AMENDMENT !== "base") await db.query(await readFile(path.resolve("supabase/migrations/20261005213229_workshop_read_quote_amounts.sql"), "utf8"));
    await db.query("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  }, 30000);
  afterAll(async () => { if (db) await db.end(); });
  const report = async (start = from, end = to) => (await db.query("select get_workshop_business_report($1,$2) as result", [start,end])).rows[0].result;

  it("counts the intake cohort and actual native/legacy payments once, not paid flags or invoice mirrors", async () => {
    const data = await report();
    expect(data.totals).toMatchObject({ orders: 4, collected: 520, knownDebtSubtotal: 1300, debt: null, unknownChargeOrders: 1, paidFlagWithoutPaymentsOrders: 1 });
    expect(data.asOf).toBe(today);
  });
  it("accepts only current-version evidence and groups assigned technician, never creator", async () => {
    const data = await report();
    expect(data.totals).toMatchObject({ acceptedCurrent: 1, rejectedCurrent: 1, staleAcceptanceOrders: 1, acceptanceRate: 50 });
    expect(data.technicians.find((row: { technicianId: string }) => row.technicianId === techA)).toMatchObject({ orders: 2, collected: 500 });
    expect(data.technicians.find((row: { technicianId: string }) => row.technicianId === admin)).toBeUndefined();
  });
  it("preserves unknown costs as null, excludes purchase payments and exposes unclassified REP expense ambiguity", async () => {
    const data = await report();
    expect(data.totals).toMatchObject({ consumedPartsCostKnown: 200, thirdPartyCostKnown: 50, directCost: null, unknownCostOrders: 2,
      knownDirectCostSubtotal: 250, directMargin: null, knownDirectMarginSubtotal: 1050, linkedPurchasePayments: 1000, unclassifiedRepExpenses: 140 });
  });
  it("computes complete known totals for a single-order cohort and never treats an explicit zero cost as unknown", async () => {
    const data = await report(to,to);
    expect(data.totals).toMatchObject({ orders: 1, debt: 600, collected: 400, directCost: 250, directMargin: 750, unknownCostOrders: 0 });
    const zeroDate = (await db.query("select intake_date::text as date from repair_access_orders where id=$1", [order(3)])).rows[0].date;
    const zero = await report(zeroDate,zeroDate);
    expect(zero.totals).toMatchObject({ directCost: 0, directMargin: 300, intakeAgeMedianDays: null });
  });
  it("reports intake age for current custody, not fabricated phase wait, and warranty-covered orders", async () => {
    const data = await report();
    expect(data.totals).toMatchObject({ activeCustody: 3, intakeAgeMedianDays: 20, intakeAgeP90Days: 36, warrantyOrders: 1, activeWarrantyOrders: 1 });
    expect(data.categories).toMatchObject({ parts: 2, unassigned: 1, return: 1 });
  });
  it("denies technician, anonymous and spoofed user metadata access", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [techA]);
    await db.query("select set_config('request.jwt.claim.user_metadata','{\"role\":\"admin\"}',false)");
    await expect(report()).rejects.toMatchObject({ code: "42501" });
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await expect(report()).rejects.toMatchObject({ code: "42501" });
    await db.query("reset role; set role anon");
    await expect(report()).rejects.toMatchObject({ code: "42501" });
    await db.query("reset role; set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  });
  it("honors underlying RLS rather than bypassing rows in a definer function", async () => {
    await db.query("reset role");
    await db.query(`alter policy report_admin_select on repair_access_orders using ((select role from profiles where id=auth.uid())='admin' and id<>'${order(1)}')`);
    await db.query("set role authenticated");
    expect((await report(to,to)).totals.orders).toBe(0);
    await db.query("reset role");
    await db.query("alter policy report_admin_select on repair_access_orders using ((select role from profiles where id=auth.uid())='admin')");
    await db.query("set role authenticated");
  });
  it("shows actual partial collections in the primary REP summary even without the paid flag", async () => {
    const summary = (await db.query("select workshop_read_page(p_limit=>1) as page")).rows[0].page.summary;
    expect(summary).toMatchObject({ totalCollected: 10519, paidOrders: 4, collectedToday: 4 });
    expect((await db.query("select is_paid from repair_access_orders where id=$1", [order(1)])).rows[0].is_paid).toBe(false);
  });
  it("preserves the exact page function identity, order payload and cursor contract", async () => {
    const page = (await db.query("select workshop_read_page(p_limit=>1) as page")).rows[0].page;
    expect(page).toMatchObject({ orders: basePage.orders, total: basePage.total, pageSize: basePage.pageSize, nextCursor: basePage.nextCursor });
    expect((await db.query("select 'private.workshop_read_page(text,text,text,text,timestamptz,uuid,integer)'::regprocedure::oid as oid")).rows[0].oid).toBe(baseFunctionOid);
  });
  it("shows a 30000 partial payment on an unpaid primary order without changing balances or history", async () => {
    await db.query("begin; reset role");
    try {
      await db.query(`insert into repair_access_orders(id,intake_date,status,final_amount,is_paid) values ('${order(6)}','2020-01-01','en_reparacion',80000,false)`);
      await db.query(`insert into repair_access_payments(repair_order_id,amount) values ('${order(6)}',30000)`);
      await db.query("set role authenticated");
      expect((await report("2020-01-01","2020-01-01")).totals).toMatchObject({ collected: 30000, debt: 50000 });
      const page = (await db.query("select workshop_read_page(p_limit=>1) as page")).rows[0].page;
      expect(page.summary.totalCollected).toBe(40519);
      expect((await db.query("select final_amount::int,is_paid from repair_access_orders where id=$1", [order(6)])).rows[0]).toMatchObject({ final_amount: 80000, is_paid: false });
      expect((await db.query("select sum(amount)::int as paid from repair_access_payments where repair_order_id=$1", [order(6)])).rows[0].paid).toBe(30000);
    } finally { await db.query("rollback"); }
  });
  it("does not create receivables from an unaccepted quote and makes uncosted imported history unknown", async () => {
    await db.query("begin; reset role");
    try {
      await db.query(`insert into repair_access_orders(id,intake_date,status,budget_amount,import_source) values ('${order(6)}','2020-01-01','presupuestado',80000,'legacy_access')`);
      await db.query("set role authenticated");
      expect((await report("2020-01-01","2020-01-01")).totals).toMatchObject({ debt: null, unknownChargeOrders: 1, directCost: null, unknownCostOrders: 1 });
    } finally { await db.query("rollback"); }
  });
  it("uses a current accepted 100000 quote when final defaults to zero, preserving missing costs as unknown", async () => {
    await db.query("begin; reset role");
    try {
      await db.query(`insert into repair_access_orders(id,intake_date,technician_id,status,budget_amount,budget_revision,approval_status) values ('${order(6)}','2020-01-01','${techA}','en_reparacion',100000,1,'accepted')`);
      await db.query(`insert into repair_budget_versions values ('${version(60)}','${order(6)}',1,100000)`);
      await db.query(`insert into repair_customer_decisions(order_id,budget_version_id,decision) values ('${order(6)}','${version(60)}','accepted')`);
      await db.query(`insert into repair_access_payments(repair_order_id,amount) values ('${order(6)}',30000)`);
      await db.query(`insert into repair_part_requests(order_id,quantity,received_quantity,installed_quantity,unit_cost,status) values ('${order(6)}',1,1,1,null,'installed')`);
      await db.query("set role authenticated");
      const data = await report("2020-01-01","2020-01-01");
      expect(data.totals).toMatchObject({ acceptedCurrent: 1, knownChargeSubtotal: 100000, collected: 30000, debt: 70000,
        knownDebtSubtotal: 70000, knownCreditSubtotal: 0, unknownChargeOrders: 0, directCost: null, unknownCostOrders: 1,
        directMargin: null, knownDirectMarginSubtotal: null });
      expect(data.technicians[0]).toMatchObject({ technicianId: techA, knownDebtSubtotal: 70000, directCost: null, unknownCostOrders: 1 });
      expect((await db.query("select final_amount::int,is_paid from repair_access_orders where id=$1", [order(6)])).rows[0]).toEqual({ final_amount: 0, is_paid: false });
    } finally { await db.query("rollback"); }
  });
  it("projects a 100000 quote instead of the zero default without treating the quote as a collection or accepted debt", async () => {
    await db.query("begin; reset role");
    try {
      const before = (await db.query("select workshop_read_page() as page")).rows[0].page.summary;
      await db.query(`insert into repair_access_orders(id,intake_date,status,budget_amount,approval_status) values ('${order(6)}','2020-01-01','presupuestado',100000,'pending')`);
      await db.query(`insert into repair_access_payments(repair_order_id,amount) values ('${order(6)}',30000)`);
      await db.query("set role authenticated");
      const summary = (await db.query("select workshop_read_page() as page")).rows[0].page.summary;
      expect(summary.totalProjected).toBe(before.totalProjected + 100000);
      expect(summary.totalCollected).toBe(before.totalCollected + 30000);
      expect((await report("2020-01-01","2020-01-01")).totals).toMatchObject({ collected: 30000, debt: null, unknownChargeOrders: 1, knownCreditSubtotal: 0 });
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [techA]);
      expect((await db.query("select workshop_read_page() as page")).rows[0].page.summary).toMatchObject({ totalProjected: 0, totalCollected: 0 });
    } finally { await db.query("rollback"); }
  });
  it("keeps an evidenced genuinely free quote and explicit zero consumed cost at zero", async () => {
    await db.query("begin; reset role");
    try {
      await db.query(`insert into repair_access_orders(id,intake_date,status,budget_amount,budget_revision,approval_status) values ('${order(6)}','2020-01-01','en_reparacion',0,1,'accepted')`);
      await db.query(`insert into repair_budget_versions values ('${version(60)}','${order(6)}',1,0)`);
      await db.query(`insert into repair_customer_decisions(order_id,budget_version_id,decision) values ('${order(6)}','${version(60)}','accepted')`);
      await db.query(`insert into repair_part_requests(order_id,quantity,received_quantity,installed_quantity,unit_cost,status) values ('${order(6)}',1,1,1,0,'installed')`);
      await db.query("set role authenticated");
      expect((await report("2020-01-01","2020-01-01")).totals).toMatchObject({ knownChargeSubtotal: 0, debt: 0, unknownChargeOrders: 0,
        directCost: 0, unknownCostOrders: 0, directMargin: 0, knownDirectMarginSubtotal: 0 });
    } finally { await db.query("rollback"); }
  });
  it("does not confuse an unpriced intake zero default with an evidenced free service", async () => {
    await db.query("begin; reset role");
    try {
      await db.query(`insert into repair_access_orders(id,intake_date,status) values ('${order(6)}','2020-01-01','pendiente_revision')`);
      await db.query("set role authenticated");
      expect((await report("2020-01-01","2020-01-01")).totals).toMatchObject({ debt: null, unknownChargeOrders: 1, directMargin: null });
    } finally { await db.query("rollback"); }
  });
  it("uses only the latest current-version decision, including a revocation", async () => {
    await db.query("begin; reset role");
    try {
      await db.query(`insert into repair_customer_decisions(order_id,budget_version_id,decision,created_at) values ('${order(1)}','${version(2)}','revoked',now()+interval '1 second')`);
      await db.query("set role authenticated");
      expect((await report(to,to)).totals).toMatchObject({ acceptedCurrent: 0, staleAcceptanceOrders: 1, acceptanceRate: null });
    } finally { await db.query("rollback"); }
  });
  it("keeps the primary REP financial summary zero for technicians and denies anonymous use", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [techA]);
    const summary = (await db.query("select workshop_read_page() as page")).rows[0].page.summary;
    expect(summary).toMatchObject({ totalCollected: 0, paidOrders: 0, collectedToday: 0, totalProjected: 0 });
    await db.query("reset role; set role anon");
    await expect(db.query("select workshop_read_page()")).rejects.toMatchObject({ code: "42501" });
    await db.query("reset role; set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  });
  it("aggregates more than 1000 records with no page cap", async () => {
    await db.query("reset role");
    await db.query("insert into repair_access_orders(id,intake_date,status,final_amount) select gen_random_uuid(),(now() at time zone 'America/Argentina/Buenos_Aires')::date-1,'en_revision',2 from generate_series(1,1201)");
    await db.query("insert into repair_access_payments(repair_order_id,amount) select id,1 from repair_access_orders where intake_date=(now() at time zone 'America/Argentina/Buenos_Aires')::date-1");
    await db.query("set role authenticated");
    const yesterday = (await db.query("select ((now() at time zone 'America/Argentina/Buenos_Aires')::date-1)::text as date")).rows[0].date;
    expect((await report(yesterday,yesterday)).totals).toMatchObject({ orders: 1201, collected: 1201, debt: 1201 });
    expect((await db.query("select workshop_read_page(p_limit=>1) as page")).rows[0].page.summary.totalCollected).toBe(11720);
  });
});
