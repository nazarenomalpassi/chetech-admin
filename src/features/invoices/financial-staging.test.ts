import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const container = process.env.CHETECH_FINANCIAL_STAGING_CONTAINER;
const suite = container ? describe : describe.skip;
suite("financial migration against the full local staging schema", () => {
  it("uses real schema, RPC guards and custody constraints in a rolled-back transaction", () => {
    if (container !== "chetech-staging-20261005") throw new Error("Only the explicitly isolated local staging container is allowed.");
    const migration = readFileSync("supabase/migrations/20261005194817_financial_atomic_documents_payments.sql", "utf8");
    const query = `begin;
      ${migration}
      insert into auth.users(id) values ('00000000-0000-4000-8000-000000000099') on conflict do nothing;
      insert into public.profiles(id,role) values ('00000000-0000-4000-8000-000000000099','admin') on conflict(id) do update set role='admin';
      set request.jwt.claim.sub='00000000-0000-4000-8000-000000000099';
      do $$ declare c uuid; d uuid; a uuid; begin
        insert into public.repair_access_customers(full_name) values ('Finanzas - fixture transaccional') returning id into c;
        insert into public.repair_access_devices(customer_id,device_type) values(c,'TV') returning id into d;
        insert into public.repair_access_orders(customer_id,device_id,issue_reported,status,final_amount) values(c,d,'Prueba aislada','listo_para_retirar',100) returning id into a;
        perform set_config('chetech.financial_fixture_access',a::text,true);
      end $$;
      set local role authenticated;
      do $$ declare a uuid := current_setting('chetech.financial_fixture_access')::uuid; r jsonb; doc jsonb; p uuid; primary_doc jsonb; original_version bigint;
        cash_before jsonb; cash_after jsonb; original_cash jsonb; runtime_before jsonb; nx_before numeric; mp_before numeric; nx_after numeric; mp_after numeric; day_start timestamptz;
      begin
        day_start := ((clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date)::timestamp at time zone 'America/Argentina/Buenos_Aires';
        select value into runtime_before from public.app_settings where key='cash_runtime';
        cash_before := public.get_cash_page_snapshot(day_start,day_start+interval '1 day');
        select coalesce(sum((x->>'total_income')::numeric-(x->>'total_outcome')::numeric),0) into nx_before from jsonb_array_elements(cash_before->'cash_summary') x where x->>'medio_pago'='nx';
        select coalesce(sum((x->>'total_income')::numeric-(x->>'total_outcome')::numeric),0) into mp_before from jsonb_array_elements(cash_before->'cash_summary') x where x->>'medio_pago'='mp';
        select workflow_version into original_version from public.repair_access_orders where id=a;
        primary_doc := public.save_invoice_atomic(jsonb_build_object('requestId',gen_random_uuid(),'customerName','Fixture','sourceType','repair_access','repairAccessOrderId',a,'items',jsonb_build_array(jsonb_build_object('description','REP sin cobro','quantity',1,'unitPrice',100))));
        if (primary_doc->>'paidTotal')::numeric<>0 or (primary_doc->>'balance')::numeric<>100 then raise exception 'Unpaid primary REP settlement incorrect'; end if;
        if (select workflow_version from public.repair_access_orders where id=a)<>original_version then raise exception 'Issuance changed the primary order'; end if;
        r := public.save_repair_financial_atomic(jsonb_build_object('requestId',gen_random_uuid(),'customerName','Fixture','device','TV','repairAccessOrderId',a,'amount',100,'entryDate','2026-09-01','paymentDate','2026-10-05','payments',jsonb_build_array(jsonb_build_object('method','nx','amount',30))));
        select to_jsonb(m) into original_cash from public.movimientos_caja m join public.repair_payments rp on rp.cash_movement_id=m.id where rp.repair_id=(r->>'id')::uuid;
        doc := public.save_invoice_atomic(jsonb_build_object('requestId',gen_random_uuid(),'customerName','Fixture','sourceType','repair','repairId',r->>'id','items',jsonb_build_array(jsonb_build_object('description','Reparacion','quantity',1,'unitPrice',100))));
        if (doc->>'paidTotal')::numeric<>30 or (doc->>'balance')::numeric<>70 then raise exception 'Settlement incorrect'; end if;
        perform public.add_repair_payment_atomic(jsonb_build_object('requestId',gen_random_uuid(),'repairId',r->>'id','paymentDate','2026-10-05','payments',jsonb_build_array(jsonb_build_object('method','mp','amount',70))));
        if (select to_jsonb(m) from public.movimientos_caja m where id=(original_cash->>'id')::uuid) is distinct from original_cash then raise exception 'Existing cash trace changed on deposit'; end if;
        if not (select is_paid from public.repair_access_orders where id=a) then raise exception 'Not paid after full collection'; end if;
        select id into p from public.repair_payments where repair_id=(r->>'id')::uuid and method='mp';
        perform public.reverse_repair_payment_atomic((r->>'id')::uuid,p,'Prueba de reversa');
        if (select status from public.repair_access_orders where id=a)<>'listo_para_retirar' or (select picked_up_at from public.repair_access_orders where id=a) is not null then raise exception 'Custody changed'; end if;
        if (public.get_invoice_document((doc->>'id')::uuid)->>'balance')::numeric<>70 then raise exception 'Read projection incorrect'; end if;
        if (select sum(case when tipo in ('gasto','sueldo') then -monto else monto end) from public.movimientos_caja where referencia_tabla='repairs' and referencia_id=(r->>'id')::uuid)<>30 then raise exception 'Cash compensation net incorrect'; end if;
        cash_after := public.get_cash_page_snapshot(day_start,day_start+interval '1 day');
        select coalesce(sum((x->>'total_income')::numeric-(x->>'total_outcome')::numeric),0) into nx_after from jsonb_array_elements(cash_after->'cash_summary') x where x->>'medio_pago'='nx';
        select coalesce(sum((x->>'total_income')::numeric-(x->>'total_outcome')::numeric),0) into mp_after from jsonb_array_elements(cash_after->'cash_summary') x where x->>'medio_pago'='mp';
        if nx_after-nx_before<>30 or mp_after-mp_before<>0 then raise exception 'Existing cash RPC sign/cutoff semantics changed'; end if;
        if (select value from public.app_settings where key='cash_runtime') is distinct from runtime_before then raise exception 'Cash opening balances or cutoff changed'; end if;
      end $$;
      do $$ declare s uuid; i uuid; invoice jsonb; original_child jsonb; original_parent jsonb; original_cash jsonb;
      begin
        invoice := public.save_invoice_atomic(jsonb_build_object('requestId',gen_random_uuid(),'customerName','Decimal fixture','sourceType','manual','discount',10.08,
          'items',jsonb_build_array(jsonb_build_object('description','Medio servicio','quantity',0.5,'unitPrice',20.15))));
        if (select subtotal from public.invoices where id=(invoice->>'id')::uuid)<>10.08 or (select total from public.invoices where id=(invoice->>'id')::uuid)<>0 then raise exception 'Decimal half-up mismatch'; end if;
        insert into public.installment_sales(product_name,customer_name,total_amount,installments_count,created_by) values('TV','Concurrent staging fixture',100,1,auth.uid()) returning id into s;
        insert into public.installments(installment_sale_id,installment_number,due_date,amount,payment_method) values(s,1,'2026-11-05',100,'nx') returning id into i;
        perform public.mutate_installment_atomic(jsonb_build_object('id',i,'action','update','expectedVersion',1,'dueDate','2026-12-05','amount',120,'paymentMethod','mp','notes','New version'));
        select to_jsonb(c) into original_child from public.installments c where id=i;
        select to_jsonb(p) into original_parent from public.installment_sales p where id=s;
        begin
          perform public.mutate_installment_atomic(jsonb_build_object('id',i,'action','update','expectedVersion',1,'dueDate','2026-12-05','amount',150,'paymentMethod','nx'));
          raise exception 'Stale edit was accepted';
        exception when serialization_failure then null; end;
        if (select to_jsonb(c) from public.installments c where id=i) is distinct from original_child or (select to_jsonb(p) from public.installment_sales p where id=s) is distinct from original_parent then raise exception 'Stale edit changed financial data'; end if;
        perform public.pay_installment_atomic(i,'mp','2026-10-05');
        select to_jsonb(c) into original_child from public.installments c where id=i;
        select jsonb_agg(to_jsonb(m) order by m.id) into original_cash from public.movimientos_caja m where referencia_tabla='installments' and referencia_id=i;
        perform public.pay_installment_atomic(i,'mp','2026-10-05');
        if (select to_jsonb(c) from public.installments c where id=i) is distinct from original_child or (select jsonb_agg(to_jsonb(m) order by m.id) from public.movimientos_caja m where referencia_tabla='installments' and referencia_id=i) is distinct from original_cash then raise exception 'Payment replay rewrote original trace'; end if;
      end $$;
      rollback;
      select 'financial staging rollback verified';`;
    const output = execFileSync("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-d", "chetech_staging", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    expect(output.trim()).toBe("financial staging rollback verified");
  });
});
