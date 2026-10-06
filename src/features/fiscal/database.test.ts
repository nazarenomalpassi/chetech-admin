import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { snapshotFixture } from "./fixtures";
import { invoiceFixture, inputFixture } from "./fixtures";
import { buildFiscalSnapshot } from "./model";
import { snapshotHash } from "./issuance";
import { decryptTicket, encryptTicket, type TicketKey } from "./ticket-crypto";

// Explicitly disposable Docker only. No project env files or remote connections.
const container = process.env.CHETECH_FISCAL_TEST_CONTAINER;
if (container && container !== "chetech-fiscal-test") throw new Error("Fiscal SQL tests require the isolated chetech-fiscal-test container.");
const suite = container ? describe : describe.skip;
const sql = (query: string) => execFileSync("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const actor = "00000000-0000-4000-8000-000000000001";
const request = "00000000-0000-4000-8000-000000000030";
const input = () => ({ requestId: request, userId: actor, snapshot: snapshotFixture(), snapshotHash: snapshotHash(snapshotFixture()) });
const call = (fn: string, input: unknown) => JSON.parse(sql(`set role service_role; select to_json(public.${fn}('${JSON.stringify(input)}'::jsonb));`));

suite("fiscal migration in disposable PostgreSQL", () => {
  beforeAll(() => {
    sql(`drop schema public cascade; drop schema if exists private cascade; create schema public; create schema private;
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
      grant usage on schema public,private to authenticated,service_role;
      create table public.profiles(id uuid primary key,role text);
      create or replace function private.is_admin() returns boolean language sql stable as $$ select true $$;
      create table public.repair_access_orders(id uuid primary key);
      create table public.invoices(id uuid primary key,invoice_number text,customer_name text,source_type text,repair_id uuid,sale_id uuid,subtotal numeric(12,2),discount numeric(12,2),total numeric(12,2),status text,notes text);
      create table public.invoice_items(id uuid primary key default gen_random_uuid(),invoice_id uuid references public.invoices(id),description text,quantity numeric(12,2),unit_price numeric(12,2),total numeric(12,2),position integer default 0);
      insert into public.profiles values ('${actor}','admin');
      insert into public.invoices values ('${snapshotFixture().invoiceId}','FAC-0010','Cliente','repair','${snapshotFixture().repairId}',null,100.10,0.10,100,'pendiente',null);
      insert into public.invoice_items(invoice_id,description,quantity,unit_price,total) values ('${snapshotFixture().invoiceId}','Servicio',1,100.10,100.10);
      grant select,update on public.invoices,public.invoice_items to authenticated; grant all on public.invoices,public.invoice_items to service_role; grant select on public.profiles to service_role;`);
    sql(readFileSync("supabase/migrations/20261005194707_fiscal_issuance_records.sql", "utf8"));
    sql(readFileSync("supabase/migrations/20261005212551_wsaa_encrypted_ticket_cache.sql", "utf8"));
  });
  it("denies browser/anonymous writes and authorization forgery", () => {
    expect(() => sql(`set role authenticated; select public.fiscal_claim('${JSON.stringify(input())}');`)).toThrow();
    expect(() => sql(`set role authenticated; insert into public.fiscal_issuance_records(id) values (gen_random_uuid());`)).toThrow();
  });
  it("claims once, rejects changed idempotency content and serializes a series", () => {
    const claimed = call("fiscal_claim", input());
    expect(claimed.kind).toBe("acquired");
    expect(call("fiscal_claim", input()).kind).toBe("busy");
    expect(() => call("fiscal_claim", { ...input(), snapshotHash: "f".repeat(64) })).toThrow();
    const other = "00000000-0000-4000-8000-000000000011";
    sql(`insert into public.invoices(id,invoice_number,customer_name,source_type,repair_id,sale_id,subtotal,discount,total,status,notes,document_version,fiscal_provider,fiscal_reference,fiscal_issued_at,fiscal_locked_at)
      select '${other}',invoice_number,customer_name,source_type,repair_id,sale_id,subtotal,discount,total,status,notes,document_version,fiscal_provider,fiscal_reference,fiscal_issued_at,fiscal_locked_at from public.invoices limit 1;
      insert into public.invoice_items(invoice_id,description,quantity,unit_price,total) values ('${other}','Servicio',1,100.10,100.10);`);
    const snapshot = { ...snapshotFixture(), invoiceId: other };
    expect(() => call("fiscal_claim", { ...input(), requestId: "00000000-0000-4000-8000-000000000031", snapshot, snapshotHash: snapshotHash(snapshot) })).toThrow();
    expect(() => sql(`update public.invoice_items set total=99 where invoice_id='${snapshotFixture().invoiceId}';`)).toThrow();
    const record = call("fiscal_prepare", { id: request, token: claimed.token, number: 1 });
    expect(record.number).toBe(1);
    call("fiscal_mark_submitting", { id: request, token: claimed.token });
    const uncertain = call("fiscal_finish", { id: request, token: claimed.token, outcome: { status: "uncertain" } });
    expect(uncertain.status).toBe("uncertain");
    expect(call("fiscal_claim", input()).kind).toBe("busy");
    sql(`update public.fiscal_issuance_records set lease_until=now()-interval '1 second' where id='${request}';`);
    const recovery = call("fiscal_claim", input());
    expect(recovery.record.number).toBe(1);
    expect(() => call("fiscal_finish", { id: request, token: claimed.token, outcome: { status: "rejected" } })).toThrow();
    expect(() => call("fiscal_finish", { id: request, token: recovery.token, outcome: { status: "accepted", authorization: { expiresOn: "2026-10-15", number: 1 } } })).toThrow();
    const accepted = call("fiscal_finish", { id: request, token: recovery.token, outcome: { status: "accepted", authorization: { cae: "12345678901234", expiresOn: "2026-10-15", number: 1, observationCodes: [] } } });
    expect(accepted.status).toBe("accepted");
    expect(call("fiscal_claim", input()).kind).toBe("accepted");
    expect(sql(`select coalesce(fiscal_reference,'NONE') from public.invoices where id='${snapshotFixture().invoiceId}';`)).toBe("NONE");
    expect(() => sql(`update public.fiscal_issuance_records set cae_authorization='{}' where id='${request}';`)).toThrow();
    expect(() => sql(`delete from public.fiscal_issuance_records where id='${request}';`)).toThrow();
  });
  it("rejects forged or stale document amounts before an ARCA call", () => {
    const snapshot = { ...snapshotFixture(), invoiceId: "00000000-0000-4000-8000-000000000011", totalCents: 9900 };
    expect(() => call("fiscal_claim", { ...input(), requestId: "00000000-0000-4000-8000-000000000032", snapshot, snapshotHash: snapshotHash(snapshot) })).toThrow();
  });
  it("locks production document content without blocking independent payment status", () => {
    const snapshot = { ...snapshotFixture(), invoiceId: "00000000-0000-4000-8000-000000000011", environment: "production" as const };
    const id = "00000000-0000-4000-8000-000000000033";
    const claimed = call("fiscal_claim", { ...input(), requestId: id, snapshot, snapshotHash: snapshotHash(snapshot) });
    call("fiscal_prepare", { id, token: claimed.token, number: 1 });
    call("fiscal_mark_submitting", { id, token: claimed.token });
    call("fiscal_finish", { id, token: claimed.token, outcome: { status: "accepted", authorization: { cae: "12345678901234", number: 1, expiresOn: "2026-10-15", observationCodes: [] } } });
    expect(sql(`select fiscal_reference from public.invoices where id='${snapshot.invoiceId}';`)).toBe("00002-00000001");
    expect(() => sql(`update public.invoices set customer_name='Otro' where id='${snapshot.invoiceId}';`)).toThrow();
    expect(() => sql(`update public.invoice_items set description='Otro' where invoice_id='${snapshot.invoiceId}';`)).toThrow();
    sql(`update public.invoices set status='pagado' where id='${snapshot.invoiceId}';`);
    expect(sql(`select status from public.invoices where id='${snapshot.invoiceId}';`)).toBe("pagado");
  });
  it.each(["pendiente", "pagado"])("claims a native REP that is %s with explicit homologation PV1 and no legacy repair", (status) => {
    const suffix = status === "pagado" ? "13" : "12";
    const invoiceId = `00000000-0000-4000-8000-0000000000${suffix}`;
    const orderId = `00000000-0000-4000-8000-0000000001${suffix}`;
    const id = `00000000-0000-4000-8000-0000000002${suffix}`;
    const document = { ...invoiceFixture, id: invoiceId, sourceType: "repair_access", repairId: null, repairAccessOrderId: orderId, status };
    const snapshot = buildFiscalSnapshot(document, inputFixture, { ...snapshotFixture(), pointOfSale: 1 });
    sql(`insert into public.repair_access_orders values ('${orderId}');
      insert into public.invoices(id,invoice_number,customer_name,source_type,repair_access_order_id,subtotal,discount,total,status)
      values ('${invoiceId}','FAC-0010','Cliente','repair_access','${orderId}',100.10,0.10,100,'${status}');
      insert into public.invoice_items(invoice_id,description,quantity,unit_price,total) values ('${invoiceId}','Servicio',1,100.10,100.10);`);
    expect(() => call("fiscal_claim", { ...input(), requestId: id, snapshot: { ...snapshot, issuer: { ...snapshot.issuer, cuit: "20123456787" } } })).toThrow();
    const fakeLink = { ...snapshot, repairAccessOrderId: "00000000-0000-4000-8000-000000000999" };
    expect(() => call("fiscal_claim", { ...input(), requestId: `00000000-0000-4000-8000-0000000003${suffix}`, snapshot: fakeLink, snapshotHash: snapshotHash(fakeLink) })).toThrow();
    const claimed = call("fiscal_claim", { ...input(), requestId: id, snapshot, snapshotHash: snapshotHash(snapshot) });
    expect(claimed.record.snapshot).toMatchObject({ sourceType: "repair_access", repairAccessOrderId: orderId, repairId: null, pointOfSale: 1, concept: 2, voucherType: 11 });
    expect(() => sql(`update public.invoices set repair_access_order_id=null where id='${invoiceId}';`)).toThrow();
    call("fiscal_prepare", { id, token: claimed.token, number: status === "pagado" ? 2 : 1 });
    call("fiscal_mark_submitting", { id, token: claimed.token });
    call("fiscal_finish", { id, token: claimed.token, outcome: { status: "accepted", authorization: { cae: "12345678901234", number: status === "pagado" ? 2 : 1, expiresOn: "2026-10-15", observationCodes: [] } } });
    expect(sql(`select coalesce(fiscal_reference,'NONE') from public.invoices where id='${invoiceId}';`)).toBe("NONE");
  });
  it("blocks production PV1 even with a synthetically valid configured issuer", () => {
    const snapshot = { ...snapshotFixture(), pointOfSale: 1, environment: "production" as const };
    expect(() => call("fiscal_claim", { ...input(), requestId: "00000000-0000-4000-8000-000000000399", snapshot, snapshotHash: snapshotHash(snapshot) })).toThrow();
  });
  it("keeps WSAA cache tables and all RPCs inaccessible to browsers/anonymous users", () => {
    const scope = { environment: "homologation", cuit: "20123456786", fingerprint: "a".repeat(64), service: "wsfe" };
    for (const role of ["authenticated", "anon"]) {
      expect(() => sql(`set role ${role}; select * from private.wsaa_ticket_cache;`)).toThrow();
      for (const fn of ["wsaa_ticket_claim", "wsaa_ticket_publish", "wsaa_ticket_release"]) {
        expect(() => sql(`set role ${role}; select public.${fn}('${JSON.stringify(scope)}');`)).toThrow();
        expect(() => sql(`set role ${role}; select private.${fn}('${JSON.stringify(scope)}');`)).toThrow();
      }
    }
    expect(sql(`select relrowsecurity from pg_class where oid='private.wsaa_ticket_cache'::regclass;`)).toBe("t");
  });
  it("serializes independent SQL clients and shares only encrypted tickets across instances", () => {
    const scope: TicketKey = { environment: "homologation", cuit: "20123456786", fingerprint: "a".repeat(64), service: "wsfe" };
    const secret = Buffer.alloc(32, 7).toString("base64");
    const ticket = { token: "synthetic-private-token", sign: "synthetic-private-sign", expires: Date.now() + 43200000 };
    const first = call("wsaa_ticket_claim", scope);
    expect(first.kind).toBe("acquired");
    expect(call("wsaa_ticket_claim", scope).kind).toBe("busy");
    const sealed = encryptTicket(ticket, scope, secret);
    expect(call("wsaa_ticket_publish", { ...scope, token: first.token, ...sealed })).toBe(true);
    expect(call("wsaa_ticket_publish", { ...scope, token: first.token, ...sealed })).toBe(true);
    const read = call("wsaa_ticket_claim", scope);
    expect(read.kind).toBe("cached");
    expect(decryptTicket(read, scope, secret)).toEqual(ticket);
    expect(sql(`select row_to_json(c)::text from private.wsaa_ticket_cache c;`)).not.toContain(ticket.token);
    expect(sql(`select row_to_json(c)::text from private.wsaa_ticket_cache c;`)).not.toContain(ticket.sign);
    expect(call("wsaa_ticket_claim", { ...scope, environment: "production" }).kind).toBe("acquired");
    expect(call("wsaa_ticket_claim", { ...scope, fingerprint: "b".repeat(64) }).kind).toBe("acquired");
    expect(() => call("wsaa_ticket_claim", { ...scope, cuit: "20123456787" })).toThrow();
  });
  it("grants exactly one lease to two concurrent PostgreSQL transactions", async () => {
    const scope: TicketKey = { environment: "homologation", cuit: "20123456786", fingerprint: "d".repeat(64), service: "wsfe" };
    const query = `begin; set role service_role; select public.wsaa_ticket_claim('${JSON.stringify(scope)}'::jsonb); select pg_sleep(0.1); commit;`;
    const connection = () => new Promise<string>((resolve, reject) => {
      execFile("docker", ["exec", container!, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }, (error, stdout) => {
        if (error) reject(error); else resolve(stdout.trim());
      });
    });
    const results = await Promise.all([connection(), connection()]);
    expect(results.map((value) => JSON.parse(value).kind).sort()).toEqual(["acquired", "busy"]);
  });
  it("fences expired/replaced leases and rejects invalid prefixes/expiration before a valid retry", () => {
    const scope: TicketKey = { environment: "homologation", cuit: "20123456786", fingerprint: "c".repeat(64), service: "wsfe" };
    const first = call("wsaa_ticket_claim", scope);
    const sealed = encryptTicket({ token: "synthetic-token", sign: "synthetic-sign", expires: Date.now() + 43200000 }, scope, Buffer.alloc(32, 7).toString("base64"));
    expect(() => call("wsaa_ticket_publish", { ...scope, token: first.token, ...sealed, ciphertext: sealed.ciphertext.replace(/^v1/, "v9") })).toThrow();
    expect(() => call("wsaa_ticket_publish", { ...scope, token: first.token, ...sealed, expires: Date.now() - 1000 })).toThrow();
    sql(`update private.wsaa_ticket_cache set lease_until=now()-interval '1 second' where certificate_fingerprint='${scope.fingerprint}';`);
    const second = call("wsaa_ticket_claim", scope);
    expect(second.kind).toBe("acquired");
    expect(second.token).not.toBe(first.token);
    expect(call("wsaa_ticket_publish", { ...scope, token: first.token, ...sealed })).toBe(false);
    expect(call("wsaa_ticket_release", { ...scope, token: first.token })).toBe(false);
    expect(call("wsaa_ticket_publish", { ...scope, token: second.token, ...sealed })).toBe(true);
    sql(`update private.wsaa_ticket_cache set expires_ms=floor(extract(epoch from now())*1000)::bigint+60000 where certificate_fingerprint='${scope.fingerprint}';`);
    expect(call("wsaa_ticket_claim", scope).kind).toBe("busy");
    sql(`update private.wsaa_ticket_cache set expires_ms=floor(extract(epoch from now())*1000)::bigint-1000 where certificate_fingerprint='${scope.fingerprint}';`);
    const renewed = call("wsaa_ticket_claim", scope);
    expect(renewed.kind).toBe("acquired");
    expect(call("wsaa_ticket_release", { ...scope, token: renewed.token })).toBe(true);
    expect(call("wsaa_ticket_claim", scope).kind).toBe("acquired");
  });
});
