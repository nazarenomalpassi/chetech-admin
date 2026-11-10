import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi, beforeEach } from "vitest";
const { rpc, createClient } = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createClient }));
import { getWorkshopOperationalMetrics } from "./operational-metrics-queries";
import { workshopOperationalMetricsSchema } from "./operational-metrics";

beforeEach(() => { vi.clearAllMocks(); createClient.mockResolvedValue({ rpc }); });
describe("workshop operational metrics server query", () => {
  it("calls one whole-database RPC, without fetching paginated orders", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await getWorkshopOperationalMetrics({ from: "2026-11-01", to: "2026-11-10" })).toBeNull();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_workshop_operational_metrics", { p_from: "2026-11-01", p_to: "2026-11-10" });
  });
  it("rejects malformed periods before creating a client", async () => {
    await expect(getWorkshopOperationalMetrics({ from: "2026-02-30", to: "2026-11-10" })).rejects.toThrow(/periodo/i);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("does not hide authorization errors as zero counters or expose database details", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private secret detail" } });
    await expect(getWorkshopOperationalMetrics({ from: "2026-11-01", to: "2026-11-10" })).rejects.toThrow("No se pudieron consultar las metricas del taller.");
  });
  it("does not convert malformed or null successful responses to empty metrics", async () => {
    for (const data of [null, {}, { current: { openOrders: -10 } }]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(getWorkshopOperationalMetrics({ from: "2026-11-01", to: "2026-11-10" })).rejects.toThrow(/respuesta.*valida/i);
    }
  });
});

// Explicit opt-in, fixed isolated Docker target, no URL/credentials/remote DBs.
const isolatedContainer = "chetech-plan-validation-20261110";
function metricsSqlSource() {
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  const name = readdirSync(migrations).find((file) => file.endsWith("_workshop_operational_metrics.sql"));
  if (name) return readFileSync(new URL(name, migrations), "utf8");
  const draft = new URL("../../../tmp/qa/workshop-operational-metrics.sql", import.meta.url);
  if (existsSync(draft)) return readFileSync(draft, "utf8");
  throw new Error("El principal debe integrar el borrador de metricas en una migracion antes de publicar.");
}
function metricsSqlForRollback(source: string): string {
  const text = source.trim();
  const outer = text.match(/^begin\s*;([\s\S]*)commit\s*;$/i);
  const body = (outer?.[1] ?? text).replace(/^\s*notify\s+pgrst\s*,\s*'reload schema'\s*;\s*$/gmi, "").trim();
  if (/^\s*(?:begin|commit|rollback)\s*;/im.test(body)) {
    throw new Error("Unsafe transaction boundary in metrics migration test.");
  }
  return body;
}
describe("metrics migration rollback envelope", () => {
  it("removes only the outer transaction and standalone PostgREST notification", () => {
    const body = "create function example() returns void language plpgsql as $$ begin null; end; $$;";
    expect(metricsSqlForRollback(`begin;\n${body}\nnotify pgrst,'reload schema';\ncommit;`)).toBe(body);
    expect(metricsSqlForRollback(body)).toBe(body);
  });
  it("rejects unbalanced or nested transaction boundaries instead of committing fixtures", () => {
    expect(() => metricsSqlForRollback("begin; select 1;")).toThrow(/transaction/i);
    expect(() => metricsSqlForRollback("begin;\nselect 1;\ncommit;\ncommit;")).toThrow(/transaction/i);
  });
});
function localSql(statements: string) {
  const network = JSON.parse(execFileSync("docker", ["inspect", isolatedContainer, "--format", "{{json .HostConfig.NetworkMode}}"], { encoding: "utf8" }).trim());
  if (network !== "none") throw new Error("Metrics SQL tests require the isolated no-network clone.");
  return execFileSync("docker", ["exec", "-i", isolatedContainer, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "chetech_staging"], {
    encoding: "utf8", input: `begin;\n${metricsSqlForRollback(metricsSqlSource())}\n${statements}\nrollback;`, maxBuffer: 4 * 1024 * 1024
  }).trim();
}
const asAdmin = `select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' order by id limit 1),true); set local role authenticated;`;
function lastJson(output: string): unknown { return JSON.parse(output.split(/\r?\n/).at(-1)!); }

describe.runIf(process.env.WORKSHOP_METRICS_TEST_CONTAINER === isolatedContainer)("isolated Postgres operational metrics (transaction rollback)", () => {
  it("returns a schema-valid full-database snapshot through the server query", async () => {
    const payload = workshopOperationalMetricsSchema.parse(lastJson(localSql(`${asAdmin} select public.get_workshop_operational_metrics();`)));
    expect(payload.period.from).toBe(`${payload.asOf.slice(0, 7)}-01`);
    expect(payload.period.to).toBe(payload.asOf);
    expect(payload.current.openOrders).toBeGreaterThan(0);
    expect(payload.current.age.days0to7 + payload.current.age.days8to14 + payload.current.age.days15to30 + payload.current.age.days31plus + payload.current.age.unknownIntakeOrders).toBe(payload.current.openOrders);
    rpc.mockResolvedValue({ data: payload, error: null });
    expect(await getWorkshopOperationalMetrics(payload.period)).toEqual(payload);
  });
  it("allows an active technician, denies missing identity and customer, leaves anonymous without EXECUTE", () => {
    const output = lastJson(localSql(`
      set local session_replication_role=replica;
      insert into public.profiles(id,role) values('ee070000-0000-4000-8000-000000000001','customer');
      set local session_replication_role=origin;
      do $check$ declare actor uuid; begin
        select id into actor from public.profiles where role='tecnico' order by id limit 1;
        perform set_config('request.jwt.claim.sub',actor::text,true);
        perform public.get_workshop_operational_metrics();
        perform set_config('request.jwt.claim.sub','',true);
        begin perform public.get_workshop_operational_metrics(); raise exception 'Missing user accepted'; exception when insufficient_privilege then null; end;
        perform set_config('request.jwt.claim.sub','ee070000-0000-4000-8000-000000000001',true);
        begin perform public.get_workshop_operational_metrics(); raise exception 'Customer accepted'; exception when insufficient_privilege then null; end;
      end $check$;
      select jsonb_agg(jsonb_build_object('schema',n.nspname,'definer',p.prosecdef,'anon',has_function_privilege('anon',p.oid,'execute'),'config',p.proconfig) order by n.nspname)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_workshop_operational_metrics';
    `)) as { schema: string; definer: boolean; anon: boolean; config: string[] }[];
    expect(output.map(({ schema, definer, anon }) => ({ schema, definer, anon }))).toEqual([{ schema: "private", definer: true, anon: false }, { schema: "public", definer: false, anon: false }]);
    expect(output.every((entry) => entry.config.includes('search_path=""'))).toBe(true);
  });
  it("rejects inverted, infinite and excessive periods in Postgres", () => {
    expect(localSql(`${asAdmin} do $check$ begin
      begin perform public.get_workshop_operational_metrics('2026-11-10','2026-11-01'); raise exception 'Inverted range accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.get_workshop_operational_metrics('2026-11-01','infinity'); raise exception 'Infinite range accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.get_workshop_operational_metrics('2000-01-01','2026-11-01'); raise exception 'Unbounded range accepted'; exception when invalid_parameter_value then null; end;
    end $check$; select 'ok';`)).toMatch(/ok$/);
  });
  it("starts observation today once, denies technicians and cannot accept a backdated argument", () => {
    const gate = lastJson(localSql(`${asAdmin}
      create temp table observation_first as select public.start_workshop_warranty_observation() as payload;
      select public.start_workshop_warranty_observation();
      reset role;
      do $check$ declare actor uuid; begin
        select id into actor from public.profiles where role='tecnico' order by id limit 1;
        perform set_config('request.jwt.claim.sub',actor::text,true);
        begin perform public.start_workshop_warranty_observation(); raise exception 'Technician started observation'; exception when insufficient_privilege then null; end;
      end $check$;
      select jsonb_build_object('first',(select payload from observation_first),
        'today',(now() at time zone 'America/Argentina/Buenos_Aires')::date,
        'count',(select count(*) from private.workshop_warranty_observation),
        'startedOn',(select started_on from private.workshop_warranty_observation),
        'startedBy',(select started_by from private.workshop_warranty_observation),
        'metrics',public.get_workshop_operational_metrics(),
        'backdateCallable',to_regprocedure('public.start_workshop_warranty_observation(date)') is not null,
        'anonExecute',has_function_privilege('anon','public.start_workshop_warranty_observation()','execute'),
        'authenticatedTableRead',has_table_privilege('authenticated','private.workshop_warranty_observation','select'),
        'authenticatedTableWrite',has_table_privilege('authenticated','private.workshop_warranty_observation','insert'));
    `)) as any;
    expect(gate.count).toBe(1);
    expect(gate.startedOn).toBe(gate.today);
    expect(gate.first.startedOn).toBe(gate.startedOn);
    expect(gate.first.startedBy).toBe(gate.startedBy);
    expect(gate.backdateCallable).toBe(false);
    expect(gate.anonExecute).toBe(false);
    expect(gate.authenticatedTableRead).toBe(false);
    expect(gate.authenticatedTableWrite).toBe(false);
    const afterStart = workshopOperationalMetricsSchema.parse(gate.metrics);
    expect(afterStart.warranty.matureCohort.comparableOrders).toBe(0);
    expect(afterStart.warranty.matureCohort.returnRate).toBeNull();
    expect(afterStart.warranty.matureCohort.reason).toMatch(/Todavia no hay/);
  });
  it("rates only complete mature observed warranties, using distinct orders and matching immutable snapshots", () => {
    const readDefinition = metricsSqlSource().match(/create or replace function private\.get_workshop_operational_metrics[\s\S]*?end;\s*\$\$;/i)![0];
    // Test-only clock advance inside the rolled-back clone. Never execute this
    // altered definition outside this opt-in no-network container.
    const advancedDefinition = readDefinition
      .replace("v_now timestamptz := now();", "v_now timestamptz := now() + interval '20 days';")
      .replace("v_today date := (now() at time zone", "v_today date := ((now() + interval '20 days') at time zone");
    expect(advancedDefinition).not.toBe(readDefinition);
    const result = lastJson(localSql(`
      ${asAdmin} select public.start_workshop_warranty_observation(); reset role;
      set local session_replication_role=replica;
      insert into public.repair_access_orders(id,customer_id,device_id,order_number,repair_number,intake_date,issue_reported,status,
        has_warranty,warranty_days,warranty_start,warranty_until,picked_up_at,delivered_at)
      select ('ee070003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,c.id,d.id,902000+n,'REP-'||(902000+n)::text,
        x.day-5,'Prospective synthetic warranty','retirado',true,5,x.day,x.day+5,
        x.day::timestamp at time zone 'America/Argentina/Buenos_Aires',x.day::timestamp at time zone 'America/Argentina/Buenos_Aires'
      from generate_series(1,4) n cross join lateral (select id from public.repair_access_customers order by id limit 1) c
        cross join lateral (select id from public.repair_access_devices order by id limit 1) d
        cross join lateral (select (now() at time zone 'America/Argentina/Buenos_Aires')::date + case n when 1 then -1 when 2 then 0 when 3 then 1 else 25 end as day) x;
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,status,recipient,closed_at,original_delivery_at,
        warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
      select o.id,o.warranty_start+2,'Observed synthetic return','retirado','Test client',o.delivered_at+interval '3 days',o.delivered_at,
        o.warranty_start,o.warranty_until,p.id,p.id from public.repair_access_orders o cross join public.profiles p
      where o.id in ('ee070003-0000-4000-8000-000000000001','ee070003-0000-4000-8000-000000000002') and p.role='admin';
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,status,recipient,closed_at,original_delivery_at,
        warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
      select o.id,o.warranty_start+4,'Repeated matching return','retirado','Test client',o.delivered_at+interval '5 days',o.delivered_at,
        o.warranty_start,o.warranty_until,p.id,p.id
      from public.repair_access_orders o cross join public.profiles p
      where o.id='ee070003-0000-4000-8000-000000000002' and p.role='admin';
      set local session_replication_role=origin;
      ${advancedDefinition}
      set local role authenticated;
      select public.get_workshop_operational_metrics(
        (now() at time zone 'America/Argentina/Buenos_Aires')::date-1,
        (now() at time zone 'America/Argentina/Buenos_Aires')::date+25);
    `));
    const payload = workshopOperationalMetricsSchema.parse(result);
    expect(payload.methodology.warrantyObservationFrom).not.toBeNull();
    expect(payload.warranty.matureCohort).toEqual({ maturedOrders: 2, returnedOrders: 1, comparableOrders: 2, returnRate: 50, reason: null });
    expect(workshopOperationalMetricsSchema.safeParse({ ...payload, methodology: { warrantyObservationFrom: null } }).success).toBe(false);
    expect(workshopOperationalMetricsSchema.safeParse({ ...payload, warranty: { ...payload.warranty, matureCohort: { ...payload.warranty.matureCohort, returnRate: 100 } } }).success).toBe(false);
  });
  it("excludes an actual post-return warranty correction instead of reporting a false zero rate", () => {
    const definition = metricsSqlSource().match(/create or replace function private\.get_workshop_operational_metrics[\s\S]*?end;\s*\$\$;/i)![0]
      .replace("v_now timestamptz := now();", "v_now timestamptz := now() + interval '20 days';")
      .replace("v_today date := (now() at time zone", "v_today date := ((now() + interval '20 days') at time zone");
    const result = lastJson(localSql(`
      ${asAdmin} select public.start_workshop_warranty_observation(); reset role;
      set local session_replication_role=replica;
      insert into public.repair_access_orders(id,customer_id,device_id,order_number,repair_number,intake_date,issue_reported,status,has_warranty,warranty_days,warranty_start,warranty_until,picked_up_at,delivered_at)
      select 'ee070004-0000-4000-8000-000000000001',c.id,d.id,903001,'REP-903001',x.day,'Correction regression fixture','retirado',true,5,x.day,x.day+5,
        x.day::timestamp at time zone 'America/Argentina/Buenos_Aires',x.day::timestamp at time zone 'America/Argentina/Buenos_Aires'
      from (select id from public.repair_access_customers order by id limit 1)c cross join (select id from public.repair_access_devices order by id limit 1)d
      cross join (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as day)x;
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,original_delivery_at,warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
      select o.id,o.warranty_start,'Real recorded return',o.delivered_at,o.warranty_start,o.warranty_until,p.id,p.id
      from public.repair_access_orders o cross join public.profiles p where o.id='ee070004-0000-4000-8000-000000000001' and p.role='admin';
      set local session_replication_role=origin;
      ${definition}
      create temp table metrics_before as select public.get_workshop_operational_metrics(
        (now() at time zone 'America/Argentina/Buenos_Aires')::date,(now() at time zone 'America/Argentina/Buenos_Aires')::date) as payload;
      select public.workshop_warranty_correct('ee070004-0000-4000-8000-000000000001',1,'ee070004-0000-4000-8000-000000000002',true,10,'Same repair','Correct recorded warranty duration',true);
      select jsonb_build_object('before',(select payload from metrics_before),'after',public.get_workshop_operational_metrics(
        (now() at time zone 'America/Argentina/Buenos_Aires')::date,(now() at time zone 'America/Argentina/Buenos_Aires')::date));
    `)) as { before: unknown; after: unknown };
    const before = workshopOperationalMetricsSchema.parse(result.before);
    const after = workshopOperationalMetricsSchema.parse(result.after);
    expect(before.warranty.matureCohort.returnRate).toBe(100);
    expect(after.warranty.matureCohort.comparableOrders).toBe(0);
    expect(after.warranty.matureCohort.returnedOrders).toBe(0);
    expect(after.warranty.matureCohort.maturedOrders).toBe(1);
    expect(after.warranty.matureCohort.returnRate).toBeNull();
    expect(after.warranty.matureCohort.reason).toMatch(/1 ordenes excluidas por cobertura corregida/);
    expect(after.warranty.activeReturns).toBe(before.warranty.activeReturns);
    expect(after.warranty.openedInPeriod).toBe(before.warranty.openedInPeriod);
    expect(after.warranty.uniqueOrdersInPeriod).toBe(before.warranty.uniqueOrdersInPeriod);
  });
  it.each(["null_start", "null_end", "mixed_snapshot"])("excludes the whole original-delivery cohort order for %s", (kind) => {
    const definition = metricsSqlSource().match(/create or replace function private\.get_workshop_operational_metrics[\s\S]*?end;\s*\$\$;/i)![0]
      .replace("v_now timestamptz := now();", "v_now timestamptz := now() + interval '20 days';")
      .replace("v_today date := (now() at time zone", "v_today date := ((now() + interval '20 days') at time zone");
    const payload = workshopOperationalMetricsSchema.parse(lastJson(localSql(`
      ${asAdmin} select public.start_workshop_warranty_observation(); reset role;
      set local session_replication_role=replica;
      insert into public.repair_access_orders(id,customer_id,device_id,order_number,repair_number,intake_date,issue_reported,status,has_warranty,warranty_days,warranty_start,warranty_until,picked_up_at,delivered_at)
      select 'ee070005-0000-4000-8000-000000000001',c.id,d.id,904001,'REP-904001',x.day,'Coverage quality regression','retirado',true,5,x.day,x.day+5,
        x.day::timestamp at time zone 'America/Argentina/Buenos_Aires',x.day::timestamp at time zone 'America/Argentina/Buenos_Aires'
      from (select id from public.repair_access_customers order by id limit 1)c cross join (select id from public.repair_access_devices order by id limit 1)d
      cross join (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as day)x;
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,status,recipient,closed_at,original_delivery_at,warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
      select o.id,o.warranty_start,'Incomplete coverage fixture','retirado','Test client',o.delivered_at+interval '1 day',o.delivered_at,
        ${kind === "null_start" ? "null" : "o.warranty_start"},${kind === "null_end" ? "null" : kind === "mixed_snapshot" ? "o.warranty_until+5" : "o.warranty_until"},p.id,p.id
      from public.repair_access_orders o cross join public.profiles p where o.id='ee070005-0000-4000-8000-000000000001' and p.role='admin';
      ${kind === "mixed_snapshot" ? `insert into public.repair_warranty_returns(order_id,received_on,issue_reported,original_delivery_at,warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
        select o.id,o.warranty_start,'Matching return alongside inconsistent history',o.delivered_at,o.warranty_start,o.warranty_until,p.id,p.id from public.repair_access_orders o cross join public.profiles p where o.id='ee070005-0000-4000-8000-000000000001' and p.role='admin';` : ""}
      set local session_replication_role=origin;
      ${definition}
      select public.get_workshop_operational_metrics((now() at time zone 'America/Argentina/Buenos_Aires')::date,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
    `)));
    expect(payload.warranty.matureCohort.comparableOrders).toBe(0);
    expect(payload.warranty.matureCohort.returnedOrders).toBe(0);
    expect(payload.warranty.matureCohort.returnRate).toBeNull();
    expect(payload.warranty.matureCohort.reason).toMatch(/1 ordenes excluidas por cobertura corregida/);
    expect(payload.warranty.uniqueOrdersInPeriod).toBeGreaterThan(0);
    expect(payload.warranty.openedInPeriod).toBeGreaterThan(0);
  });
  it("aggregates more than 30 fixture orders, ignores generic edits and reconstructs no ready dates", () => {
    const result = lastJson(localSql(`
      ${asAdmin}
      create temp table metrics_before as select public.get_workshop_operational_metrics() as payload;
      reset role;
      set local session_replication_role=replica;
      insert into public.repair_access_orders(id,customer_id,device_id,order_number,repair_number,intake_date,issue_reported,status)
      select ('ee070001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,c.id,d.id,900000+n,'REP-'||(900000+n)::text,
        (now() at time zone 'America/Argentina/Buenos_Aires')::date -
          case n when 1 then 0 when 2 then 7 when 3 then 8 when 4 then 14 when 5 then 15 when 6 then 30 when 7 then 31 when 8 then -1 else 40 end,
        'Synthetic metrics test',case when n<=3 then 'listo_para_retirar' else 'pendiente_revision' end
      from generate_series(1,45) n cross join lateral (select id from public.repair_access_customers order by id limit 1) c
        cross join lateral (select id from public.repair_access_devices order by id limit 1) d;
      insert into public.workshop_events(order_id,kind,message,created_at) values
        ('ee070001-0000-4000-8000-000000000004','part_request','Repuesto solicitado',now()-interval '9 days'),
        ('ee070001-0000-4000-8000-000000000004','update','Ficha actualizada',now()),
        ('ee070001-0000-4000-8000-000000000005','part_update','Repuesto recibido',now()-interval '1 day'),
        ('ee070001-0000-4000-8000-000000000006','warranty','Garantia corregida',now()),
        ('ee070001-0000-4000-8000-000000000006','supplier_claim','Reclamo de proveedor registrado',now());
      insert into public.repair_access_status_history(repair_order_id,previous_status,next_status,changed_at,notes) values
        ('ee070001-0000-4000-8000-000000000001','pendiente_revision','en_revision',now()-interval '8 days','Real transition'),
        ('ee070001-0000-4000-8000-000000000001','en_revision','listo_para_retirar',now()-interval '4 days','Real transition'),
        ('ee070001-0000-4000-8000-000000000002','pendiente_revision','listo_para_retirar',now()-interval '20 days','Real transition'),
        ('ee070001-0000-4000-8000-000000000002','listo_para_retirar','en_revision',now()-interval '10 days','Real transition'),
        ('ee070001-0000-4000-8000-000000000002','en_revision','listo_para_retirar',now()-interval '2 days','Real transition'),
        ('ee070001-0000-4000-8000-000000000003',null,'listo_para_retirar',now()-interval '2 days','Estado reconstruido durante la importacion historica.'),
        ('ee070001-0000-4000-8000-000000000007','en_revision','pendiente_revision',now()+interval '1 day','Future transition');
      insert into public.repair_part_requests(operation_id,order_id,description,quantity,received_quantity,status,requested_by)
      select gen_random_uuid(),'ee070001-0000-4000-8000-000000000001','Synthetic part',3,1,'requested',id from public.profiles where role='admin';
      insert into public.repair_part_requests(operation_id,order_id,description,quantity,received_quantity,status,requested_by)
      select gen_random_uuid(),'ee070001-0000-4000-8000-000000000001','Synthetic part',4,1,'ordered',id from public.profiles where role='admin';
      insert into public.repair_part_requests(operation_id,order_id,description,quantity,status,requested_by)
      select gen_random_uuid(),'ee070001-0000-4000-8000-000000000002','Cancelled synthetic part',99,'cancelled',id from public.profiles where role='admin';
      set local session_replication_role=origin;
      set local role authenticated;
      select jsonb_build_object('before',(select payload from metrics_before),'after',public.get_workshop_operational_metrics());
    `)) as { before: unknown; after: unknown };
    const before = workshopOperationalMetricsSchema.parse(result.before);
    const after = workshopOperationalMetricsSchema.parse(result.after);
    expect(after.current.openOrders - before.current.openOrders).toBe(45);
    expect(after.current.age.days0to7 - before.current.age.days0to7).toBe(2);
    expect(after.current.age.days8to14 - before.current.age.days8to14).toBe(2);
    expect(after.current.age.days15to30 - before.current.age.days15to30).toBe(2);
    expect(after.current.age.days31plus - before.current.age.days31plus).toBe(38);
    expect(after.current.age.unknownIntakeOrders - before.current.age.unknownIntakeOrders).toBe(1);
    expect(after.current.inactivity.staleOrders - before.current.inactivity.staleOrders).toBe(1);
    expect(after.current.inactivity.knownActivityOrders - before.current.inactivity.knownActivityOrders).toBe(4);
    expect(after.current.inactivity.unknownActivityOrders - before.current.inactivity.unknownActivityOrders).toBe(41);
    expect(after.current.ready.orders - before.current.ready.orders).toBe(3);
    expect(after.current.ready.datedOrders - before.current.ready.datedOrders).toBe(2);
    expect(after.current.ready.unknownDateOrders - before.current.ready.unknownDateOrders).toBe(1);
    expect(after.current.parts.orders - before.current.parts.orders).toBe(1);
    expect(after.current.parts.requests - before.current.parts.requests).toBe(2);
    expect(after.current.parts.unitsToPurchase - before.current.parts.unitsToPurchase).toBe(2);
    expect(after.current.parts.unitsInTransit - before.current.parts.unitsInTransit).toBe(3);
    expect(after.current.parts.unitsToReceive - before.current.parts.unitsToReceive).toBe(5);
    expect(after.quality.reconstructedStatusEvents - before.quality.reconstructedStatusEvents).toBe(1);
    expect(after.phaseDurations.find((phase) => phase.status === "en_revision")).toEqual({ status: "en_revision", samples: 2, orders: 2, medianDays: 6 });
  });
  it("uses Argentina date boundaries and separates warranty visits from original closures and mature cohorts", () => {
    const result = lastJson(localSql(`
      ${asAdmin}
      create temp table metrics_before as select public.get_workshop_operational_metrics('2026-01-01','2026-01-31') as payload;
      reset role;
      set local session_replication_role=replica;
      insert into public.repair_access_orders(id,customer_id,device_id,order_number,repair_number,intake_date,issue_reported,status,
        has_warranty,warranty_days,warranty_start,warranty_until,picked_up_at,delivered_at)
      select ('ee070002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,c.id,d.id,901000+n,'REP-'||(901000+n)::text,
        '2025-12-01','Synthetic warranty metrics', 'retirado',true,30,'2026-01-01','2026-01-31',
        '2026-01-01T03:00:00Z','2026-01-01T03:00:00Z'
      from generate_series(1,2) n cross join lateral (select id from public.repair_access_customers order by id limit 1) c
        cross join lateral (select id from public.repair_access_devices order by id limit 1) d;
      insert into public.repair_access_orders(id,customer_id,device_id,order_number,repair_number,intake_date,issue_reported,status,picked_up_at,delivered_at)
      select 'ee070002-0000-4000-8000-000000000003',c.id,d.id,901003,'REP-901003','2025-12-01','Boundary synthetic','retirado',
        '2026-01-01T02:59:59Z','2026-01-01T02:59:59Z'
      from (select id from public.repair_access_customers order by id limit 1) c cross join (select id from public.repair_access_devices order by id limit 1) d;
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,status,recipient,closed_at,original_delivery_at,warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
      select 'ee070002-0000-4000-8000-000000000001','2026-01-02','First synthetic return','retirado','Test client','2026-01-03T15:00:00Z','2026-01-01T03:00:00Z','2026-01-01','2026-01-31',id,id from public.profiles where role='admin';
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,status,recipient,closed_at,original_delivery_at,warranty_start_snapshot,warranty_until_snapshot,created_by,updated_by)
      select 'ee070002-0000-4000-8000-000000000001','2026-01-04','Second synthetic return','retirado','Test client','2026-01-05T15:00:00Z','2026-01-01T03:00:00Z','2026-01-01','2026-01-31',id,id from public.profiles where role='admin';
      insert into public.repair_warranty_returns(order_id,received_on,issue_reported,status,original_delivery_at,created_by,updated_by)
      select 'ee070002-0000-4000-8000-000000000002','2026-02-02','Exception outside warranty','pendiente_revision','2026-01-01T03:00:00Z',id,id from public.profiles where role='admin';
      set local session_replication_role=origin; set local role authenticated;
      select jsonb_build_object('before',(select payload from metrics_before),'after',public.get_workshop_operational_metrics('2026-01-01','2026-01-31'));
    `)) as { before: unknown; after: unknown };
    const before = workshopOperationalMetricsSchema.parse(result.before);
    const after = workshopOperationalMetricsSchema.parse(result.after);
    expect(after.periodFlow.closures - before.periodFlow.closures).toBe(2);
    expect(after.periodFlow.intakes - before.periodFlow.intakes).toBe(0);
    expect(after.warranty.openedInPeriod - before.warranty.openedInPeriod).toBe(2);
    expect(after.warranty.closedInPeriod - before.warranty.closedInPeriod).toBe(2);
    expect(after.warranty.uniqueOrdersInPeriod - before.warranty.uniqueOrdersInPeriod).toBe(1);
    expect(after.warranty.activeReturns - before.warranty.activeReturns).toBe(1);
    expect(after.warranty.matureCohort.maturedOrders - before.warranty.matureCohort.maturedOrders).toBe(2);
    expect(after.warranty.matureCohort.returnedOrders - before.warranty.matureCohort.returnedOrders).toBe(1);
    expect(after.warranty.matureCohort.comparableOrders).toBeNull();
    expect(after.warranty.matureCohort.returnRate).toBeNull();
    expect(after.warranty.matureCohort.reason).toMatch(/observacion continua/);
  });
});

describe("operational metrics SQL static guardrails (not a live SQL test)", () => {
  function sql() {
    return metricsSqlSource();
  }
  it("keeps privileged code private, public wrapper invoker and grants limited", () => {
    const draft = sql();
    expect(draft).toMatch(/function private\.get_workshop_operational_metrics[\s\S]*?stable security definer set search_path\s*=\s*''/i);
    expect(draft).toMatch(/function public\.get_workshop_operational_metrics[\s\S]*?stable security invoker set search_path\s*=\s*''/i);
    expect(draft).toMatch(/auth\.uid\(\) is null/i);
    expect(draft).toMatch(/private\.can_access_operations\(\)/);
    expect(draft).toMatch(/role in \('admin',\s*'tecnico'\)/);
    expect(draft).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated, service_role/i);
    expect(draft).not.toMatch(/grant[\s\S]*to\s+(?:public|anon|service_role)\s*;/i);
  });
  it("reads full tables without financial writes, page limits or generic edit timestamps", () => {
    const source = sql().match(/create or replace function private\.get_workshop_operational_metrics[\s\S]*?end;\s*\$\$;/i)?.[0] ?? "";
    expect(source).not.toBe("");
    const draft = source.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    expect(draft).not.toMatch(/\b(insert|update|delete|truncate|alter table|limit|updated_at)\b/i);
    for (const table of ["repair_access_orders", "repair_access_status_history", "workshop_events", "repair_part_requests", "repair_warranty_returns"]) expect(draft).toContain(`public.${table}`);
    expect(draft).toContain("percentile_cont(0.5)");
    expect(draft).toMatch(/count\(distinct/);
  });
  it("excludes reconstructed history, leaves unproven warranty observation unknown and uses local boundaries", () => {
    const draft = sql();
    expect(draft).toContain("Estado reconstruido durante la importacion historica.");
    expect(draft).toContain("America/Argentina/Buenos_Aires");
    expect(draft).toContain("'warrantyObservationFrom', v_observation_from");
    expect(draft).toMatch(/warranty_start\s*>=\s*v_observation_from/i);
    expect(draft).toContain("w.warranty_start_snapshot = m.warranty_start");
    expect(draft).toContain("w.warranty_until_snapshot = m.warranty_until");
  });
  it("persists the observation gate privately and exposes only an admin-guarded no-argument starter", () => {
    const draft = sql();
    expect(draft).toMatch(/create table if not exists private\.workshop_warranty_observation/i);
    expect(draft).toMatch(/function private\.start_workshop_warranty_observation\(\)[\s\S]*?private\.is_admin\(\)/i);
    expect(draft).toMatch(/function public\.start_workshop_warranty_observation\(\)[\s\S]*?security invoker/i);
    expect(draft).toMatch(/on conflict\s*\(singleton\) do nothing/i);
  });
});
