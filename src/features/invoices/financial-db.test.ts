import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { mapPrimaryOrderOption } from "./primary-order-mapper";
import { calculateInvoiceAmounts } from "./document-model";

// Opt-in only: never reads project credentials or connects to a remote database.
const container = process.env.CHETECH_FINANCIAL_TEST_CONTAINER;
const suite = container ? describe : describe.skip;
const admin = "00000000-0000-4000-8000-000000000001";
const sql = (query: string) => execFileSync("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const asAdmin = (query: string) => sql(`set request.jwt.claim.sub = '${admin}'; ${query}`);
const concurrently = (query: string) => new Promise<string>((resolve, reject) => {
  const child = spawn("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
  let output = ""; let error = "";
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { error += chunk; });
  child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
  child.stdin.end(`set request.jwt.claim.sub='${admin}'; ${query}`);
});
const invoiceInput = (requestId: string, patch: object = {}) => ({ requestId, customerName: "Cliente", sourceType: "manual", discount: 0, items: [{ description: "Servicio", quantity: 1, unitPrice: 100 }], ...patch });
const callSave = (input: object) => JSON.parse(asAdmin(`select public.save_invoice_atomic('${JSON.stringify(input)}'::jsonb);`));

suite("financial RPCs on disposable PostgreSQL", () => {
  beforeAll(() => {
    if (container !== "chetech-financial-test") throw new Error("Only the disposable financial test container is allowed.");
    sql(`drop schema public cascade; create schema public; create schema if not exists auth;
      create table if not exists auth.users(id uuid primary key);
      create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role; exception when duplicate_object then null; end $$;`);
    const schema = readFileSync("supabase/schema.sql", "utf8");
    for (const table of ["profiles", "categories", "clientes", "products", "sales", "sale_items", "sale_payments", "repairs", "repair_payments", "invoices", "invoice_items", "invoice_payments", "installment_sales", "installments", "movimientos_caja", "audit_logs"]) {
      const declaration = schema.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
      if (!declaration) throw new Error(`Missing fixture table: ${table}`);
      sql(declaration);
    }
    sql(`create table public.repair_access_orders(id uuid primary key, status text, final_amount numeric, approved_amount numeric, budget_amount numeric, is_paid boolean default false, payment_method text, payment_notes text, paid_at timestamptz, picked_up_at timestamptz, delivered_at timestamptz, warranty_start date, warranty_until date, warranty_active boolean, updated_by uuid, updated_at timestamptz);
      alter table public.repairs add column repair_access_order_id uuid references public.repair_access_orders(id);
      create table public.repair_access_payments(id uuid primary key default gen_random_uuid(),repair_order_id uuid references public.repair_access_orders(id),payment_date date default current_date,method text,amount numeric,created_at timestamptz default now(),legacy_repair_payment_id uuid references public.repair_payments(id) on delete set null,voided_at timestamptz,void_reason text);
      insert into auth.users values ('${admin}') on conflict do nothing; insert into public.profiles(id,role) values ('${admin}','admin');`);
    sql(readFileSync("supabase/migrations/20261005194817_financial_atomic_documents_payments.sql", "utf8"));
  }, 30000);

  it("quarantines ambiguous legacy REP mutations on the server without changing their history", () => {
    expect(asAdmin(`begin;
      do $$ declare o uuid:=gen_random_uuid(); a uuid; b uuid; p uuid; before_state jsonb; after_state jsonb; command text;
      begin
        insert into public.repair_access_orders(id,status,final_amount,is_paid) values(o,'retirado',100,true);
        insert into public.repairs(customer_name,device,issue_description,final_price,repair_access_order_id) values('Historico A','TV','Falla',100,o) returning id into a;
        insert into public.repairs(customer_name,device,issue_description,final_price,repair_access_order_id) values('Historico B','TV','Falla',300,o) returning id into b;
        insert into public.repair_payments(repair_id,method,amount) values(a,'nx',100) returning id into p;
        insert into public.repair_payments(repair_id,method,amount) values(b,'mp',300);
        select jsonb_build_object('repairs',(select jsonb_agg(to_jsonb(r) order by id) from public.repairs r),'payments',(select jsonb_agg(to_jsonb(r) order by id) from public.repair_payments r),'cash',(select jsonb_agg(to_jsonb(r) order by id) from public.movimientos_caja r),'audit',(select jsonb_agg(to_jsonb(r) order by id) from public.audit_logs r),'orders',(select jsonb_agg(to_jsonb(r) order by id) from public.repair_access_orders r)) into before_state;
        foreach command in array array[
          format('select public.add_repair_payment_atomic(%L::jsonb)',jsonb_build_object('requestId',gen_random_uuid(),'repairId',a,'paymentDate','2026-10-06','payments',jsonb_build_array(jsonb_build_object('method','nx','amount',1)))::text),
          format('select public.save_repair_financial_atomic(%L::jsonb)',jsonb_build_object('requestId',gen_random_uuid(),'id',a,'expectedVersion',1,'repairAccessOrderId',o,'customerName','Historico A','device','TV','amount',100,'entryDate','2026-10-06')::text),
          format('select public.reverse_repair_payment_atomic(%L::uuid,%L::uuid,%L)',a,p,'Error de carga'),
          format('select public.delete_repair_financial_atomic(%L::uuid)',a),
          format('select public.sync_repair_financial_projection(%L::uuid)',a),
          format('select public.ensure_repair_cash_baseline(%L::uuid)',a),
          format('select public.rebuild_repair_cash_projection(%L::uuid)',a),
          format('select public.append_repair_cash_correction(%L::uuid,%L::uuid,%L)',a,p,'Error de carga')
        ] loop
          begin execute command; raise exception 'Ambiguous mutation was allowed';
          exception when sqlstate '22023' then
            if position('varios registros financieros' in sqlerrm)=0 then raise; end if;
          end;
        end loop;
        select jsonb_build_object('repairs',(select jsonb_agg(to_jsonb(r) order by id) from public.repairs r),'payments',(select jsonb_agg(to_jsonb(r) order by id) from public.repair_payments r),'cash',(select jsonb_agg(to_jsonb(r) order by id) from public.movimientos_caja r),'audit',(select jsonb_agg(to_jsonb(r) order by id) from public.audit_logs r),'orders',(select jsonb_agg(to_jsonb(r) order by id) from public.repair_access_orders r)) into after_state;
        if before_state is distinct from after_state then raise exception 'Historical data changed'; end if;
      end $$;
      select 'ambiguous history preserved'; rollback;`)).toContain("ambiguous history preserved");
  });

  it("stores partial settlement, retries once and rolls back an invalid detail", () => {
    const repair = asAdmin(`insert into public.repairs(customer_name,device,issue_description,final_price) values ('Cliente','TV','Falla',100) returning id;`);
    asAdmin(`insert into public.repair_payments(repair_id,method,amount) values ('${repair}','nx',30);`);
    const input = invoiceInput("00000000-0000-4000-8000-000000000010", { sourceType: "repair", repairId: repair });
    const saved = callSave(input);
    expect(saved).toMatchObject({ action: "insert", paidTotal: 30, balance: 70 });
    expect(callSave(input).id).toBe(saved.id);
    expect(asAdmin(`select count(*) from public.invoices where id = '${saved.id}';`)).toBe("1");
    expect(() => callSave({ ...input, id: saved.id, expectedVersion: 1, requestId: "00000000-0000-4000-8000-000000000011", items: [{ description: "Broken", quantity: 0, unitPrice: 200 }] })).toThrow();
    expect(asAdmin(`select description from public.invoice_items where invoice_id='${saved.id}';`)).toBe("Servicio");
    expect(asAdmin(`select count(*) from public.movimientos_caja;`)).toBe("0");
    expect(() => callSave({ ...input, id: saved.id, expectedVersion: 1, requestId: "00000000-0000-4000-8000-000000000012", customerName: "Changed", items: [{ description: "Foreign key failure after old detail deletion", quantity: 1, unitPrice: 100, productId: "00000000-0000-4000-8000-000000000098" }] })).toThrow();
    expect(asAdmin(`select customer_name || ':' || document_version from public.invoices where id='${saved.id}';`)).toBe("Cliente:1");
    expect(asAdmin(`select description from public.invoice_items where invoice_id='${saved.id}';`)).toBe("Servicio");
  });

  it("rejects stale edits and fiscal-locked edits/voids", () => {
    const saved = callSave(invoiceInput("00000000-0000-4000-8000-000000000020"));
    expect(() => callSave(invoiceInput("00000000-0000-4000-8000-000000000021", { id: saved.id, expectedVersion: 99 }))).toThrow();
    asAdmin(`update public.invoices set fiscal_locked_at=now() where id='${saved.id}';`);
    expect(() => callSave(invoiceInput("00000000-0000-4000-8000-000000000022", { id: saved.id, expectedVersion: 1 }))).toThrow();
    expect(() => asAdmin(`select public.void_invoice_atomic('${saved.id}',1);`)).toThrow();
  });

  it("appends deposits idempotently, retains payment dates and reverses without delivery/warranty mutation", () => {
    const accessId = "00000000-0000-4000-8000-000000000030";
    asAdmin(`insert into public.repair_access_orders(id,status,final_amount,delivered_at,picked_up_at,warranty_start,warranty_until,warranty_active) values ('${accessId}','retirado',100,'2026-09-01','2026-09-01','2026-09-01','2026-10-01',true);`);
    const input = { requestId: "00000000-0000-4000-8000-000000000031", customerName: "Cliente", device: "TV", repairAccessOrderId: accessId, orderNumber: "REP-1", issueDescription: "Falla", entryDate: "2026-09-01", paymentDate: "2026-10-01", amount: 100, payments: [{ method: "nx", amount: 30 }] };
    const saved = JSON.parse(asAdmin(`select public.save_repair_financial_atomic('${JSON.stringify(input)}');`));
    const payment = { repairId: saved.id, requestId: "00000000-0000-4000-8000-000000000032", paymentDate: "2026-10-05", payments: [{ method: "mp", amount: 70 }] };
    for (let i = 0; i < 2; i++) asAdmin(`select public.add_repair_payment_atomic('${JSON.stringify(payment)}');`);
    expect(asAdmin(`select sum(amount) from public.repair_payments where repair_id='${saved.id}';`)).toBe("100.00");
    expect(asAdmin(`select string_agg(payment_date::text,',' order by payment_date) from public.repair_payments where repair_id='${saved.id}';`)).toBe("2026-10-01,2026-10-05");
    const paymentId = asAdmin(`select id from public.repair_payments where repair_id='${saved.id}' and method='mp';`);
    asAdmin(`select public.reverse_repair_payment_atomic('${saved.id}','${paymentId}','Error de carga');`);
    expect(asAdmin(`select is_paid::text || ',' || status || ',' || warranty_start::text from public.repair_access_orders where id='${accessId}';`)).toBe("false,retirado,2026-09-01");
    expect(asAdmin(`select sum(case when tipo in ('gasto','sueldo') then -monto else monto end) from public.movimientos_caja where referencia_tabla='repairs' and referencia_id='${saved.id}';`)).toBe("30.00");
    expect(asAdmin(`select count(*) from public.audit_logs where entity_type='repair_payments' and action='delete';`)).toBe("1");
  });

  it("pays an installment once and rejects conflicting/cancelled payments", () => {
    const sale = asAdmin(`insert into public.installment_sales(product_name,customer_name,total_amount,installments_count) values ('TV','Cliente',100,1) returning id;`);
    const id = asAdmin(`insert into public.installments(installment_sale_id,installment_number,due_date,amount,payment_method) values ('${sale}',1,'2026-10-05',100,'nx') returning id;`);
    for (let i = 0; i < 2; i++) asAdmin(`select public.pay_installment_atomic('${id}','nx','2026-10-05');`);
    expect(asAdmin(`select count(*) from public.movimientos_caja where referencia_tabla='installments' and referencia_id='${id}';`)).toBe("1");
    expect(asAdmin(`select status from public.installment_sales where id='${sale}';`)).toBe("finalizada");
    expect(() => asAdmin(`select public.pay_installment_atomic('${id}','mp','2026-10-05');`)).toThrow();
    asAdmin(`update public.installment_sales set status='cancelada' where id='${sale}';`);
    expect(() => asAdmin(`select public.pay_installment_atomic('${id}','nx','2026-10-05');`)).toThrow();
  });

  it("rejects unauthenticated mutations", () => {
    expect(() => sql(`select public.save_invoice_atomic('${JSON.stringify(invoiceInput("00000000-0000-4000-8000-000000000040"))}');`)).toThrow();
  });

  it("keeps a zero-final primary REP's positive budget and actual partial settlement", () => {
    const accessId = "00000000-0000-4000-8000-000000000300";
    asAdmin(`insert into public.repair_access_orders(id,final_amount,approved_amount,budget_amount) values('${accessId}',0,0,80000);
      insert into public.repair_access_payments(repair_order_id,method,amount) values('${accessId}','nx',30000);`);
    const option = mapPrimaryOrderOption({ id: accessId, final_amount: 0, approved_amount: 0, budget_amount: 80000 });
    const saved = callSave(invoiceInput("00000000-0000-4000-8000-000000000301", { sourceType: "repair_access", repairAccessOrderId: accessId, items: [{ description: "REP", quantity: 1, unitPrice: option.amount }] }));
    expect(JSON.parse(asAdmin(`select public.get_invoice_document('${saved.id}');`))).toMatchObject({ total: 80000, paid_total: 30000, balance: 50000, status: "parcial" });
    const repairId = asAdmin(`insert into public.repairs(repair_access_order_id,customer_name,device,issue_description,final_price) values('${accessId}','Budget priority','TV','Test',0) returning id;`);
    asAdmin(`select public.sync_repair_financial_projection('${repairId}');`);
    expect(asAdmin(`select is_paid::text from public.repair_access_orders where id='${accessId}';`)).toBe("false");
  });

  it("matches decimal-safe line totals and full discount with PostgreSQL numeric half-up", () => {
    const items = [{ description: "Medio servicio", quantity: 0.5, unitPrice: 20.15 }, { description: "Otra mitad", quantity: 0.5, unitPrice: 20.15 }];
    const saved = callSave(invoiceInput("00000000-0000-4000-8000-000000000302", { items, discount: 20.16 }));
    const doc = JSON.parse(asAdmin(`select public.get_invoice_document('${saved.id}');`));
    const expected = calculateInvoiceAmounts(items, 20.16);
    expect(doc).toMatchObject({ subtotal: expected.subtotal, discount: 20.16, total: 0, paid_total: 0, balance: 0, status: "pagado" });
    expect(doc.items.map((item: any) => item.total)).toEqual(expected.lineTotals);
  });

  it("rejects stale and unversioned installment edits before changing child or parent totals", () => {
    const sale = asAdmin(`insert into public.installment_sales(product_name,customer_name,total_amount,installments_count) values('TV','Two editors',100,1) returning id;`);
    const id = asAdmin(`insert into public.installments(installment_sale_id,installment_number,due_date,amount,payment_method) values('${sale}',1,'2026-10-05',100,'nx') returning id;`);
    const input = { id, action: "update", expectedVersion: 1, dueDate: "2026-11-05", amount: 120, paymentMethod: "mp", notes: "Editor 1" };
    asAdmin(`select public.mutate_installment_atomic('${JSON.stringify(input)}');`);
    const original = asAdmin(`select to_jsonb(i) from public.installments i where id='${id}';`);
    const parent = asAdmin(`select to_jsonb(s) from public.installment_sales s where id='${sale}';`);
    expect(() => asAdmin(`select public.mutate_installment_atomic('${JSON.stringify({ ...input, amount: 150, notes: "Editor 2 stale" })}');`)).toThrow();
    expect(() => asAdmin(`select public.mutate_installment_atomic('${JSON.stringify({ ...input, expectedVersion: undefined })}');`)).toThrow();
    expect(() => asAdmin(`select public.mutate_installment_atomic('${JSON.stringify({ id, action: "cancel", expectedVersion: 1 })}');`)).toThrow();
    expect(asAdmin(`select to_jsonb(i) from public.installments i where id='${id}';`)).toBe(original);
    expect(asAdmin(`select to_jsonb(s) from public.installment_sales s where id='${sale}';`)).toBe(parent);
    expect(asAdmin(`select financial_version from public.installments where id='${id}';`)).toBe("2");
    asAdmin(`select public.pay_installment_atomic('${id}','mp','2026-10-05');`);
    const paid = asAdmin(`select to_jsonb(i) from public.installments i where id='${id}';`);
    const cash = asAdmin(`select jsonb_agg(to_jsonb(m) order by id) from public.movimientos_caja m where referencia_tabla='installments' and referencia_id='${id}';`);
    asAdmin(`select public.pay_installment_atomic('${id}','mp','2026-10-05');`);
    expect(asAdmin(`select to_jsonb(i) from public.installments i where id='${id}';`)).toBe(paid);
    expect(asAdmin(`select jsonb_agg(to_jsonb(m) order by id) from public.movimientos_caja m where referencia_tabla='installments' and referencia_id='${id}';`)).toBe(cash);
  });

  it("serializes competing installment edits using the displayed financial version", async () => {
    const sale = asAdmin(`insert into public.installment_sales(product_name,customer_name,total_amount,installments_count) values('TV','Concurrent editors',100,1) returning id;`);
    const id = asAdmin(`insert into public.installments(installment_sale_id,installment_number,due_date,amount,payment_method) values('${sale}',1,'2026-10-05',100,'nx') returning id;`);
    const edit = (amount: number) => `select public.mutate_installment_atomic('${JSON.stringify({ id, action: "update", expectedVersion: 1, dueDate: "2026-11-05", amount, paymentMethod: "nx", notes: `Amount ${amount}` })}');`;
    const results = await Promise.allSettled([concurrently(edit(120)), concurrently(edit(150))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(asAdmin(`select financial_version from public.installments where id='${id}';`)).toBe("2");
    expect(asAdmin(`select (s.total_amount=i.amount)::text from public.installment_sales s join public.installments i on i.installment_sale_id=s.id where i.id='${id}';`)).toBe("true");
    expect(asAdmin(`select count(*) from public.movimientos_caja where referencia_tabla='installments' and referencia_id='${id}';`)).toBe("0");
  });

  it("creates the installment schedule atomically and idempotently", () => {
    const input = { requestId: "00000000-0000-4000-8000-000000000050", productName: "Radio", customerName: "Cliente", totalAmount: 100, installmentsCount: 2, installments: [{ installmentNumber: 1, dueDate: "2026-10-31", amount: 50, paymentMethod: "nx" }, { installmentNumber: 2, dueDate: "2026-11-30", amount: 50, paymentMethod: "mp" }] };
    const saved = JSON.parse(asAdmin(`select public.save_installment_sale_atomic('${JSON.stringify(input)}');`));
    expect(JSON.parse(asAdmin(`select public.save_installment_sale_atomic('${JSON.stringify(input)}');`)).id).toBe(saved.id);
    expect(asAdmin(`select count(*) from public.installments where installment_sale_id='${saved.id}';`)).toBe("2");
    const before = asAdmin("select count(*) from public.installment_sales;");
    expect(() => asAdmin(`select public.save_installment_sale_atomic('${JSON.stringify({ ...input, requestId: "00000000-0000-4000-8000-000000000051", installments: [{ ...input.installments[0], amount: 0 }, input.installments[1]] })}');`)).toThrow();
    expect(asAdmin("select count(*) from public.installment_sales;")).toBe(before);
  });

  it("protects fiscal content against direct header or detail writes", () => {
    const saved = callSave(invoiceInput("00000000-0000-4000-8000-000000000060", { fiscalProvider: "Externo", fiscalReference: "0001-1234" }));
    expect(() => asAdmin(`update public.invoices set customer_name='Otro cliente' where id='${saved.id}';`)).toThrow();
    expect(() => asAdmin(`update public.invoice_items set description='Otra linea' where invoice_id='${saved.id}';`)).toThrow();
    expect(() => asAdmin(`delete from public.invoices where id='${saved.id}';`)).toThrow();
  });

  it("serializes competing deposits so only one can consume the remaining balance", async () => {
    const input = { requestId: "00000000-0000-4000-8000-000000000070", customerName: "Concurrent", device: "TV", amount: 100, entryDate: "2026-10-05", paymentDate: "2026-10-05", payments: [] };
    const saved = JSON.parse(asAdmin(`select public.save_repair_financial_atomic('${JSON.stringify(input)}');`));
    const add = (requestId: string) => `select public.add_repair_payment_atomic('${JSON.stringify({ repairId: saved.id, requestId, paymentDate: "2026-10-05", payments: [{ method: "nx", amount: 60 }] })}');`;
    const results = await Promise.allSettled([concurrently(add("00000000-0000-4000-8000-000000000071")), concurrently(add("00000000-0000-4000-8000-000000000072"))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(asAdmin(`select sum(amount) from public.repair_payments where repair_id='${saved.id}';`)).toBe("60.00");
  });

  it("includes unmirrored native payments in invoice settlement and overpayment checks", () => {
    const accessId = "00000000-0000-4000-8000-000000000080";
    asAdmin(`insert into public.repair_access_orders(id,status,final_amount) values('${accessId}','listo_para_retirar',100); insert into public.repair_access_payments(repair_order_id,method,amount) values('${accessId}','mp',30);`);
    const saved = JSON.parse(asAdmin(`select public.save_repair_financial_atomic('${JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000081", customerName: "Native", device: "TV", repairAccessOrderId: accessId, amount: 100, entryDate: "2026-10-05", paymentDate: "2026-10-05", payments: [{ method: "nx", amount: 20 }] })}');`));
    const doc = callSave(invoiceInput("00000000-0000-4000-8000-000000000082", { sourceType: "repair", repairId: saved.id }));
    expect(doc).toMatchObject({ paidTotal: 50, balance: 50 });
    expect(() => asAdmin(`select public.add_repair_payment_atomic('${JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000083", repairId: saved.id, paymentDate: "2026-10-05", payments: [{ method: "nx", amount: 60 }] })}');`)).toThrow();
    const before = asAdmin(`select count(*) from public.movimientos_caja;`);
    asAdmin(`select public.void_invoice_atomic('${doc.id}',1);`);
    expect(asAdmin(`select count(*) from public.movimientos_caja;`)).toBe(before);
    expect(JSON.parse(asAdmin(`select public.get_invoice_document('${doc.id}');`))).toMatchObject({ paid_total: 50, balance: 0, status: "anulado" });
    const legacyId = asAdmin(`select id from public.repair_payments where repair_id='${saved.id}';`);
    asAdmin(`select public.reverse_repair_payment_atomic('${saved.id}','${legacyId}','Pago cargado por error');`);
    expect(asAdmin(`select payment_method from public.repair_access_orders where id='${accessId}';`)).toBe("mp");
  });

  it("numbers documents beyond four digits without truncation", () => {
    asAdmin("insert into public.invoices(invoice_number,customer_name) values ('FAC-9999','Numbering fixture');");
    const saved = callSave(invoiceInput("00000000-0000-4000-8000-000000000090"));
    expect(asAdmin(`select invoice_number from public.invoices where id='${saved.id}';`)).toBe("FAC-10000");
  });
  it("documents a primary REP before payment and combines all linked actual collections", () => {
    const accessId = "00000000-0000-4000-8000-000000000100";
    asAdmin(`insert into public.repair_access_orders(id,status,final_amount) values('${accessId}','presupuestado_aceptado',100);`);
    const saved = callSave(invoiceInput("00000000-0000-4000-8000-000000000101", { sourceType: "repair_access", repairAccessOrderId: accessId }));
    expect(saved).toMatchObject({ paidTotal: 0, balance: 100 });
    const repairId = asAdmin(`insert into public.repairs(repair_access_order_id,customer_name,device,issue_description,final_price) values('${accessId}','Primary REP','TV','Falla',100) returning id;`);
    const legacyPaymentId = asAdmin(`insert into public.repair_payments(repair_id,method,amount) values('${repairId}','nx',20) returning id;`);
    asAdmin(`insert into public.repair_access_payments(repair_order_id,method,amount) values('${accessId}','mp',30); insert into public.repair_access_payments(repair_order_id,method,amount,legacy_repair_payment_id) values('${accessId}','nx',20,'${legacyPaymentId}');`);
    const doc = JSON.parse(asAdmin(`select public.get_invoice_document('${saved.id}');`));
    expect(doc).toMatchObject({ repair_access_order_id: accessId, repair_id: null, paid_total: 50, balance: 50, status: "parcial" });
    expect(doc.payments).toHaveLength(2);
    expect(asAdmin(`select status from public.repair_access_orders where id='${accessId}';`)).toBe("presupuestado_aceptado");
    expect(() => asAdmin(`delete from public.repair_access_orders where id='${accessId}';`)).toThrow();
  });

  it("preserves grouped legacy cash IDs, actors and cutoff timestamps when appending and correcting a deposit", () => {
    const oldActor = "00000000-0000-4000-8000-000000000201";
    const accessId = "00000000-0000-4000-8000-000000000202";
    asAdmin(`insert into auth.users(id) values('${oldActor}') on conflict do nothing; insert into public.profiles(id,role) values('${oldActor}','admin');
      insert into public.repair_access_orders(id,status,final_amount) values('${accessId}','listo_para_retirar',200);`);
    const repairId = asAdmin(`insert into public.repairs(customer_name,device,issue_description,final_price,repair_access_order_id) values('Legacy projection','TV','Test',200,'${accessId}') returning id;`);
    const oldPayment = asAdmin(`insert into public.repair_payments(repair_id,method,amount,payment_date,created_at) values('${repairId}','nx',70,'2026-04-16','2026-04-16T14:21:01.223Z') returning id;`);
    const oldCash = asAdmin(`insert into public.movimientos_caja(tipo,monto,medio_pago,referencia_tabla,referencia_id,created_by,fecha) values('reparacion',70,'nx','repairs','${repairId}','${oldActor}','2026-04-16T14:21:01.223Z') returning id;`);
    const native = asAdmin(`insert into public.repair_access_payments(repair_order_id,method,amount) values('${accessId}','mp',30) returning id;`);
    const nativeCash = asAdmin(`insert into public.movimientos_caja(tipo,monto,medio_pago,referencia_tabla,referencia_id,created_by,fecha) values('reparacion',30,'mp','repair_access_payments','${native}','${oldActor}','2026-10-05T12:17:21.234Z') returning id;`);
    asAdmin(`insert into public.repair_access_payments(repair_order_id,method,amount,legacy_repair_payment_id) values('${accessId}','nx',70,'${oldPayment}');`);
    const original = asAdmin(`select jsonb_agg(to_jsonb(m) order by id) from public.movimientos_caja m where id in('${oldCash}','${nativeCash}');`);
    const input = { repairId, requestId: "00000000-0000-4000-8000-000000000203", paymentDate: "2026-10-05", paymentTimestamp: "2026-10-05T18:43:21.456-03:00", payments: [{ method: "nx", amount: 20 }] };
    for (let retry = 0; retry < 2; retry++) asAdmin(`select public.add_repair_payment_atomic('${JSON.stringify(input)}');`);
    expect(asAdmin(`select jsonb_agg(to_jsonb(m) order by id) from public.movimientos_caja m where id in('${oldCash}','${nativeCash}');`)).toBe(original);
    expect(asAdmin(`select count(*) from public.movimientos_caja where referencia_tabla='repairs' and referencia_id='${repairId}';`)).toBe("2");
    const newPayment = asAdmin(`select id from public.repair_payments where repair_id='${repairId}' and amount=20;`);
    expect(asAdmin(`select (m.fecha='2026-10-05T21:43:21.456Z'::timestamptz and m.created_by='${admin}')::text from public.repair_payments p join public.movimientos_caja m on m.id=p.cash_movement_id where p.id='${newPayment}';`)).toBe("true");
    const collectionCash = asAdmin(`select cash_movement_id from public.repair_payments where id='${newPayment}';`);
    const newOriginal = asAdmin(`select to_jsonb(m) from public.movimientos_caja m where id='${collectionCash}';`);
    asAdmin(`select public.rebuild_repair_cash_projection('${repairId}');`);
    expect(asAdmin(`select to_jsonb(m) from public.movimientos_caja m where id='${collectionCash}';`)).toBe(newOriginal);
    const start = asAdmin("select clock_timestamp();");
    for (let retry = 0; retry < 2; retry++) asAdmin(`select public.reverse_repair_payment_atomic('${repairId}','${newPayment}','Correccion de registro erroneo');`);
    expect(asAdmin(`select to_jsonb(m) from public.movimientos_caja m where id='${collectionCash}';`)).toBe(newOriginal);
    expect(asAdmin(`select jsonb_agg(to_jsonb(m) order by id) from public.movimientos_caja m where id in('${oldCash}','${nativeCash}');`)).toBe(original);
    expect(asAdmin(`select count(*) from public.movimientos_caja where repair_payment_id='${newPayment}' and repair_projection_kind='correction';`)).toBe("1");
    expect(asAdmin(`select (tipo='gasto' and monto=20 and created_by='${admin}' and fecha>='${start}'::timestamptz and corrects_cash_movement_id='${collectionCash}' and descripcion like '%registro erroneo%')::text from public.movimientos_caja where repair_payment_id='${newPayment}' and repair_projection_kind='correction';`)).toBe("true");
    expect(asAdmin(`select sum(case when tipo in ('gasto','sueldo') then -monto else monto end) from public.movimientos_caja where referencia_tabla='repairs' and referencia_id='${repairId}';`)).toBe("70.00");
    expect(asAdmin(`select public.repair_actual_paid_total('${repairId}');`)).toBe("100.00");
  });

  it("corrects a grouped legacy projection once without allocating fabricated historic timestamps", () => {
    const repairId = asAdmin(`insert into public.repairs(customer_name,device,issue_description,final_price) values('Grouped','TV','Test',100) returning id;`);
    const paymentId = asAdmin(`insert into public.repair_payments(repair_id,method,amount,payment_date) values('${repairId}','efectivo',40,'2026-04-16') returning id;`);
    const cashId = asAdmin(`insert into public.movimientos_caja(tipo,monto,medio_pago,referencia_tabla,referencia_id,created_by,fecha) values('reparacion',40,'efectivo','repairs','${repairId}','${admin}','2026-04-16T14:21:01.221Z') returning id;`);
    const original = asAdmin(`select to_jsonb(m) from public.movimientos_caja m where id='${cashId}';`);
    for (let retry=0; retry<2; retry++) asAdmin(`select public.reverse_repair_payment_atomic('${repairId}','${paymentId}','Correccion de carga historica');`);
    expect(asAdmin(`select to_jsonb(m) from public.movimientos_caja m where id='${cashId}';`)).toBe(original);
    expect(asAdmin(`select count(*) from public.movimientos_caja where referencia_tabla='repairs' and referencia_id='${repairId}';`)).toBe("2");
    expect(asAdmin(`select sum(case when tipo in ('gasto','sueldo') then -monto else monto end) from public.movimientos_caja where referencia_tabla='repairs' and referencia_id='${repairId}';`)).toBe("0.00");
  });

  it("does not invent a cash debit for an unprojected historic payment or delete unexplained installment cash", () => {
    const repairId = asAdmin(`insert into public.repairs(customer_name,device,issue_description,final_price) values('Unprojected','TV','Test',100) returning id;`);
    const paymentId = asAdmin(`insert into public.repair_payments(repair_id,method,amount) values('${repairId}','nx',40) returning id;`);
    expect(() => asAdmin(`select public.reverse_repair_payment_atomic('${repairId}','${paymentId}','Correccion sin evidencia');`)).toThrow();
    expect(asAdmin(`select count(*) from public.repair_payments where id='${paymentId}';`)).toBe("1");
    const sale = asAdmin(`insert into public.installment_sales(product_name,customer_name,total_amount,installments_count) values('TV','Unexplained',100,1) returning id;`);
    const id = asAdmin(`insert into public.installments(installment_sale_id,installment_number,due_date,amount,payment_method) values('${sale}',1,'2026-10-05',100,'nx') returning id;`);
    const cashId = asAdmin(`insert into public.movimientos_caja(tipo,monto,medio_pago,referencia_tabla,referencia_id,fecha) values('venta',100,'nx','installments','${id}','2026-04-16T14:21:01.223Z') returning id;`);
    expect(() => asAdmin(`select public.pay_installment_atomic('${id}','nx','2026-10-05');`)).toThrow();
    expect(asAdmin(`select (fecha='2026-04-16T14:21:01.223Z'::timestamptz)::text from public.movimientos_caja where id='${cashId}';`)).toBe("true");
  });
});
