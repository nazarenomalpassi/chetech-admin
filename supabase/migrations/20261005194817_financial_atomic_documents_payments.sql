-- Financial operations only. Existing RLS remains authoritative (security invoker).
alter table public.invoices
  add column if not exists repair_access_order_id uuid references public.repair_access_orders(id) on delete restrict,
  add column if not exists document_version integer not null default 1,
  add column if not exists fiscal_provider text,
  add column if not exists fiscal_reference text,
  add column if not exists fiscal_issued_at timestamptz,
  add column if not exists fiscal_locked_at timestamptz;
alter table public.invoices drop constraint if exists invoices_source_type_check;
alter table public.invoices add constraint invoices_source_type_check check(source_type in ('manual','repair','repair_access','sale'));
alter table public.invoice_items add column if not exists position integer not null default 0;
alter table public.repairs add column if not exists financial_version integer not null default 1;
alter table public.installments add column if not exists financial_version integer not null default 1;
-- No historic payment/cash row is assigned a fabricated time or one-to-one allocation.
alter table public.repair_payments
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists cash_posted_at timestamptz,
  add column if not exists cash_timestamp_precision text check(cash_timestamp_precision in ('provided','recorded','business_date')),
  add column if not exists cash_movement_id uuid references public.movimientos_caja(id) on delete restrict;
alter table public.movimientos_caja
  add column if not exists repair_payment_id uuid,
  add column if not exists repair_projection_key text,
  add column if not exists repair_projection_kind text check(repair_projection_kind in ('collection','correction')),
  add column if not exists repair_projection_baseline_id uuid references public.audit_logs(id) on delete restrict,
  add column if not exists corrects_cash_movement_id uuid references public.movimientos_caja(id) on delete restrict;
create unique index if not exists repair_cash_projection_key on public.movimientos_caja(repair_projection_key) where repair_projection_key is not null;
create unique index if not exists repair_cash_baseline_receipt_key on public.audit_logs(entity_id)
  where entity_type='repair_cash_projection' and changes->>'kind'='baseline';

create unique index if not exists financial_audit_operation_key
  on public.audit_logs ((changes->>'operation_id'))
  where changes ? 'operation_id';
create index if not exists invoices_repair_id_financial_idx on public.invoices(repair_id) where repair_id is not null;
create index if not exists invoices_primary_rep_financial_idx on public.invoices(repair_access_order_id) where repair_access_order_id is not null;
create index if not exists invoices_sale_id_financial_idx on public.invoices(sale_id) where sale_id is not null;

create or replace function public.financial_assert_admin()
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from public.profiles where id=v_user and role='admin') then
    raise exception 'Solo un administrador puede gestionar operaciones financieras.' using errcode='42501';
  end if;
  return v_user;
end;
$$;

-- The audit event is also the durable idempotency receipt, including after reversal.
create or replace function public.financial_operation_replay(p_request_id uuid, p_input jsonb, p_operation text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_event jsonb;
begin
  perform public.financial_assert_admin();
  if p_request_id is null then raise exception 'Falta identificador de operacion.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial:' || p_request_id::text, 0));
  select changes into v_event from public.audit_logs where changes->>'operation_id'=p_request_id::text;
  if v_event is not null then
    if v_event->'input' is distinct from p_input or v_event->>'operation' is distinct from p_operation then
      raise exception 'Identificador reutilizado con datos diferentes.' using errcode='22023';
    end if;
    return v_event->'result';
  end if;
  return null;
end;
$$;

create or replace function public.invoice_actual_payments(p_invoice_id uuid)
returns table(id uuid, method text, amount numeric, payment_date date, source text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.method, p.amount, (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'sale'::text
  from public.invoices i join public.sale_payments p on p.sale_id=i.sale_id where i.id=p_invoice_id and i.source_type='sale'
  union all
  select p.id, p.method, p.amount, p.payment_date, 'repair'::text
  from public.invoices i join public.repair_payments p on p.repair_id=i.repair_id where i.id=p_invoice_id and i.source_type='repair'
  union all
  select p.id, p.method, p.amount, p.payment_date, 'repair_access'::text
  from public.invoices i join public.repairs r on r.id=i.repair_id
  join public.repair_access_payments p on p.repair_order_id=r.repair_access_order_id
  where i.id=p_invoice_id and i.source_type='repair' and p.voided_at is null and p.legacy_repair_payment_id is null
  union all
  select p.id,p.method,p.amount,p.payment_date,'repair'::text
  from public.invoices i join public.repairs r on r.repair_access_order_id=i.repair_access_order_id
  join public.repair_payments p on p.repair_id=r.id where i.id=p_invoice_id and i.source_type='repair_access'
  union all
  select p.id,p.method,p.amount,p.payment_date,'repair_access'::text
  from public.invoices i join public.repair_access_payments p on p.repair_order_id=i.repair_access_order_id
  where i.id=p_invoice_id and i.source_type='repair_access' and p.voided_at is null and p.legacy_repair_payment_id is null
  union all
  select p.id, p.method, p.amount, p.payment_date, 'manual'::text
  from public.invoices i join public.invoice_payments p on p.invoice_id=i.id where i.id=p_invoice_id and i.source_type='manual';
$$;

create or replace function public.repair_actual_paid_total(p_repair_id uuid)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(p.amount),0) from (
    select amount from public.repair_payments where repair_id=p_repair_id
    union all
    select ap.amount from public.repairs r join public.repair_access_payments ap on ap.repair_order_id=r.repair_access_order_id
      where r.id=p_repair_id and ap.legacy_repair_payment_id is null and ap.voided_at is null
  ) p;
$$;

create or replace function public.get_invoice_settlements(p_invoice_ids uuid[])
returns table(invoice_id uuid, paid_total numeric, balance numeric, status text, header jsonb)
language sql stable security invoker set search_path = '' as $$
  select i.id, p.paid, case when i.status='anulado' then 0 else greatest(i.total-p.paid,0) end,
    case when i.status='anulado' then 'anulado' when p.paid>=i.total then 'pagado' when p.paid>0 then 'parcial' else 'pendiente' end,
    pg_catalog.to_jsonb(i)
  from public.invoices i cross join lateral (select coalesce(sum(amount),0) paid from public.invoice_actual_payments(i.id)) p
  where i.id=any(p_invoice_ids);
$$;

create or replace function public.get_invoice_document(p_invoice_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.to_jsonb(i) || pg_catalog.jsonb_build_object(
    'paid_total', s.paid_total, 'balance', s.balance, 'status', s.status,
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.position,d.id) from public.invoice_items d where d.invoice_id=i.id),'[]'::jsonb),
    'payments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.payment_date,p.id) from public.invoice_actual_payments(i.id) p),'[]'::jsonb)
  ) from public.invoices i join public.get_invoice_settlements(array[p_invoice_id]) s on s.invoice_id=i.id where i.id=p_invoice_id;
$$;

create or replace function public.refresh_invoice_totals(p_invoice_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_subtotal numeric; v_discount numeric;
begin
  perform public.financial_assert_admin();
  select discount into v_discount from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'No se encontro el comprobante.' using errcode='P0002'; end if;
  select coalesce(sum(total),0) into v_subtotal from public.invoice_items where invoice_id=p_invoice_id;
  update public.invoices set subtotal=v_subtotal, total=greatest(v_subtotal-v_discount,0) where id=p_invoice_id;
  update public.invoices i set paid_total=s.paid_total, balance=s.balance, status=s.status
    from public.get_invoice_settlements(array[p_invoice_id]) s where i.id=s.invoice_id;
end;
$$;

create or replace function public.save_invoice_atomic(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := public.financial_assert_admin(); v_id uuid := nullif(p_input->>'id','')::uuid;
  v_request uuid := (p_input->>'requestId')::uuid; v_replay jsonb; v_previous public.invoices;
  v_source text := p_input->>'sourceType'; v_repair uuid; v_sale uuid; v_number text; v_primary uuid;
  v_discount numeric := coalesce((p_input->>'discount')::numeric,0); v_subtotal numeric;
  v_action text; v_result jsonb; v_version integer; v_access uuid;
begin
  v_replay := public.financial_operation_replay(v_request,p_input,'save_invoice');
  if v_replay is not null then return v_replay; end if;
  if v_source not in ('manual','repair','repair_access','sale') or v_source is null or nullif(btrim(p_input->>'customerName'),'') is null
    or jsonb_typeof(p_input->'items') is distinct from 'array' then
    raise exception 'Revisa los datos del comprobante.' using errcode='22023';
  end if;
  if jsonb_array_length(p_input->'items') not between 1 and 500 then raise exception 'Agrega entre 1 y 500 items.' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_input->'items') d where nullif(btrim(d->>'description'),'') is null
    or length(d->>'description')>10000 or coalesce((d->>'quantity')::numeric,0)<=0 or coalesce((d->>'unitPrice')::numeric,-1)<0
    or (d->>'quantity')::numeric <> round((d->>'quantity')::numeric,2) or (d->>'unitPrice')::numeric <> round((d->>'unitPrice')::numeric,2)
    or (d->>'quantity')::numeric::text in ('NaN','Infinity','-Infinity') or (d->>'unitPrice')::numeric::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Revisa cantidades, precios y descripciones.' using errcode='22023';
  end if;
  select sum(round((d->>'quantity')::numeric*(d->>'unitPrice')::numeric,2)) into v_subtotal from jsonb_array_elements(p_input->'items') d;
  if v_discount<0 or v_discount>v_subtotal or v_discount<>round(v_discount,2) or v_discount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'El descuento no puede superar el subtotal.' using errcode='22023';
  end if;
  v_repair := case when v_source='repair' then nullif(p_input->>'repairId','')::uuid end;
  v_sale := case when v_source='sale' then nullif(p_input->>'saleId','')::uuid end;
  v_primary := case when v_source='repair_access' then nullif(p_input->>'repairAccessOrderId','')::uuid end;
  if (v_source='repair' and v_repair is null) or (v_source='sale' and v_sale is null) or (v_source='repair_access' and v_primary is null) then raise exception 'Selecciona el origen vinculado.' using errcode='22023'; end if;
  -- Same root-to-document lock order as collection RPCs; issuance cannot observe half a collection.
  if v_repair is not null then
    select repair_access_order_id into v_access from public.repairs where id=v_repair for update;
    if not found then raise exception 'No se encontro la reparacion vinculada.' using errcode='P0002'; end if;
    if v_access is not null then perform 1 from public.repair_access_orders where id=v_access for update; end if;
  end if;
  if v_sale is not null then
    perform 1 from public.sales where id=v_sale for update;
    if not found then raise exception 'No se encontro la venta vinculada.' using errcode='P0002'; end if;
  end if;
  if v_primary is not null then
    perform 1 from public.repair_access_orders where id=v_primary for update;
    if not found then raise exception 'No se encontro la REP principal vinculada.' using errcode='P0002'; end if;
  end if;
  if (nullif(btrim(p_input->>'fiscalProvider'),'') is null) <> (nullif(btrim(p_input->>'fiscalReference'),'') is null) then
    raise exception 'Indica proveedor y referencia fiscal externa juntos.' using errcode='22023';
  end if;
  if v_id is null then
    v_action := 'insert';
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('invoice_number'));
    select (coalesce(max(substring(invoice_number from '^FAC-([0-9]+)$')::bigint),0)+1)::text into v_number
      from public.invoices where invoice_number ~ '^FAC-[0-9]+$';
    v_number := 'FAC-' || lpad(v_number,greatest(4,length(v_number)),'0');
    insert into public.invoices(invoice_number,customer_name,created_by) values(v_number,btrim(p_input->>'customerName'),v_user) returning id into v_id;
    v_version := 1;
  else
    v_action := 'update';
    select * into v_previous from public.invoices where id=v_id for update;
    if not found then raise exception 'No se encontro el comprobante.' using errcode='P0002'; end if;
    if v_previous.status='anulado' or v_previous.fiscal_reference is not null or v_previous.fiscal_locked_at is not null then
      raise exception 'Comprobante anulado o bloqueado por emision fiscal; no se puede editar.' using errcode='22023';
    end if;
    if (p_input->>'expectedVersion')::integer is distinct from v_previous.document_version then
      raise exception 'El comprobante cambio. Recarga antes de guardar.' using errcode='40001';
    end if;
    if (v_previous.source_type,v_previous.repair_id,v_previous.sale_id,v_previous.repair_access_order_id) is distinct from (v_source,v_repair,v_sale,v_primary)
      and exists(select 1 from public.invoice_payments where invoice_id=v_id) then
      raise exception 'No se puede cambiar el origen de un comprobante con pagos propios.' using errcode='22023';
    end if;
    v_version := v_previous.document_version+1;
  end if;
  update public.invoices set customer_name=btrim(p_input->>'customerName'), customer_phone=nullif(p_input->>'customerPhone',''),
    source_type=v_source, repair_id=v_repair, sale_id=v_sale, repair_access_order_id=v_primary, discount=v_discount, notes=nullif(p_input->>'notes',''),
    document_version=v_version, updated_at=now() where id=v_id;
  delete from public.invoice_items where invoice_id=v_id;
  insert into public.invoice_items(invoice_id,description,quantity,unit_price,total,product_id,repair_id,position)
    select v_id,btrim(d->>'description'),(d->>'quantity')::numeric,(d->>'unitPrice')::numeric,
      round((d->>'quantity')::numeric*(d->>'unitPrice')::numeric,2),nullif(d->>'productId','')::uuid,v_repair,ordinality::integer
    from jsonb_array_elements(p_input->'items') with ordinality as x(d,ordinality);
  perform public.refresh_invoice_totals(v_id);
  update public.invoices set fiscal_provider=nullif(btrim(p_input->>'fiscalProvider'),''), fiscal_reference=nullif(btrim(p_input->>'fiscalReference'),''),
    fiscal_issued_at=nullif(p_input->>'fiscalIssuedAt','')::timestamptz where id=v_id;
  select jsonb_build_object('id',id,'action',v_action,'documentVersion',document_version,'paidTotal',paid_total,'balance',balance) into v_result from public.invoices where id=v_id;
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('invoices',v_id::text,v_action,v_user,
    jsonb_build_object('operation_id',v_request,'operation','save_invoice','input',p_input,'result',v_result,'previous',to_jsonb(v_previous)));
  return v_result;
end;
$$;

create or replace function public.void_invoice_atomic(p_invoice_id uuid,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'No se encontro el comprobante.' using errcode='P0002'; end if;
  if v_invoice.fiscal_reference is not null or v_invoice.fiscal_locked_at is not null then
    raise exception 'La correccion fiscal debe realizarse desde el circuito fiscal, no por anulacion interna.' using errcode='22023';
  end if;
  if v_invoice.status='anulado' then return jsonb_build_object('id',p_invoice_id); end if;
  if v_invoice.document_version is distinct from p_expected_version then raise exception 'El comprobante cambio. Recarga antes de anular.' using errcode='40001'; end if;
  update public.invoices set status='anulado',balance=0,document_version=document_version+1,updated_at=now() where id=p_invoice_id;
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('invoices',p_invoice_id::text,'update',v_user,jsonb_build_object('status','anulado','previous',to_jsonb(v_invoice)));
  -- No payment, cash or stock is inserted, deleted or reversed by document operations.
  return jsonb_build_object('id',p_invoice_id);
end;
$$;

create or replace function public.sync_repair_financial_projection(p_repair_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_access uuid; v_paid numeric; v_price numeric; v_paid_at timestamptz; v_method text; v_notes text;
begin
  perform public.financial_assert_admin();
  select repair_access_order_id into v_access from public.repairs where id=p_repair_id;
  if v_access is not null then
    select coalesce(case when final_amount>0 then final_amount end,case when approved_amount>0 then approved_amount end,case when budget_amount>0 then budget_amount end,0)
      into v_price from public.repair_access_orders where id=v_access for update;
    if not found then raise exception 'No se encontro la orden vinculada.' using errcode='P0002'; end if;
    select coalesce(sum(p.amount),0),max(p.created_at),string_agg(p.method || ': ' || p.amount::text,' + ' order by p.created_at,p.id)
      into v_paid,v_paid_at,v_notes from (
        select rp.id,rp.amount,rp.method,rp.created_at from public.repairs r join public.repair_payments rp on rp.repair_id=r.id where r.repair_access_order_id=v_access
        union all select ap.id,ap.amount,ap.method,ap.created_at from public.repair_access_payments ap where ap.repair_order_id=v_access and ap.voided_at is null and ap.legacy_repair_payment_id is null
      ) p;
    if v_price<=0 then select coalesce(max(coalesce(final_price,estimated_price)),0) into v_price from public.repairs where repair_access_order_id=v_access; end if;
    select p.method into v_method from (
      select rp.id,rp.method,rp.created_at from public.repairs r join public.repair_payments rp on rp.repair_id=r.id where r.repair_access_order_id=v_access
      union all select ap.id,ap.method,ap.created_at from public.repair_access_payments ap where ap.repair_order_id=v_access and ap.voided_at is null and ap.legacy_repair_payment_id is null
    ) p order by p.created_at desc,p.id desc limit 1;
    update public.repair_access_orders set is_paid=(v_paid>0 and v_paid>=v_price),
      paid_at=case when v_paid>0 and v_paid>=v_price then coalesce(paid_at,v_paid_at) else null end,
      payment_method=v_method,payment_notes=v_notes,updated_by=auth.uid(),updated_at=now() where id=v_access;
  end if;
  -- Refresh projections only; immutable document content/version is unaffected by collections.
  perform public.refresh_invoice_totals(i.id) from public.invoices i where i.repair_id=p_repair_id or i.repair_access_order_id=v_access order by i.id;
end;
$$;

create or replace function public.repair_cash_method(p_method text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
begin
  return case lower(btrim(p_method))
    when 'efectivo' then 'efectivo' when 'nx' then 'nx' when 'nx santi' then 'nx' when 'nx_santi' then 'nx'
    when 'mp' then 'mp' when 'nx local' then 'mp' when 'nx_local' then 'mp' when 'mercado pago' then 'mp' else null end;
end;
$$;

create or replace function public.repair_payment_posting_time(p_date date,p_timestamp text)
returns table(posted_at timestamptz,timestamp_precision text) language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_at timestamptz;
begin
  if p_date is null then raise exception 'Falta fecha de cobro.' using errcode='22023'; end if;
  if nullif(p_timestamp,'') is not null then
    if p_timestamp !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or position('T' in p_timestamp)=0 then raise exception 'El timestamp necesita zona horaria explicita.' using errcode='22023'; end if;
    v_at := p_timestamp::timestamptz;
    if (v_at at time zone 'America/Argentina/Buenos_Aires')::date<>p_date then raise exception 'El timestamp no coincide con la fecha argentina del cobro.' using errcode='22023'; end if;
    return query select v_at,'provided'::text;
  elsif p_date=(v_now at time zone 'America/Argentina/Buenos_Aires')::date then
    return query select v_now,'recorded'::text;
  else
    -- An explicitly supplied business date for a NEW posting, not an inferred historic time.
    return query select p_date::timestamp at time zone 'America/Argentina/Buenos_Aires','business_date'::text;
  end if;
end;
$$;

create or replace function public.ensure_repair_cash_baseline(p_repair_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_receipt public.audit_logs; v_changes jsonb;
begin
  perform 1 from public.repairs where id=p_repair_id for update;
  if not found then raise exception 'No se encontro la reparacion.' using errcode='P0002'; end if;
  select * into v_receipt from public.audit_logs where entity_type='repair_cash_projection' and entity_id=p_repair_id::text and changes->>'kind'='baseline';
  if found then return v_receipt.changes || jsonb_build_object('auditId',v_receipt.id); end if;
  v_changes := jsonb_build_object('kind','baseline','policy','Existing grouped projections retained without inferred allocations or timestamps',
    'legacyPaymentIds',coalesce((select jsonb_agg(id order by id) from public.repair_payments where repair_id=p_repair_id and cash_posted_at is null and cash_movement_id is null),'[]'::jsonb),
    'cashMovements',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.movimientos_caja m where referencia_tabla='repairs' and referencia_id=p_repair_id),'[]'::jsonb));
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('repair_cash_projection',p_repair_id::text,'insert',v_user,v_changes) returning * into v_receipt;
  return v_changes || jsonb_build_object('auditId',v_receipt.id);
end;
$$;

-- Compatibility name: this now APPENDS only new, evidenced payment projections.
create or replace function public.rebuild_repair_cash_projection(p_repair_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_baseline jsonb; v_payment public.repair_payments;
  v_cash public.movimientos_caja; v_method text; v_order text; v_key text;
begin
  v_baseline := public.ensure_repair_cash_baseline(p_repair_id);
  select coalesce(order_number,id::text) into v_order from public.repairs where id=p_repair_id;
  for v_payment in select * from public.repair_payments where repair_id=p_repair_id order by id for update loop
    if v_payment.cash_movement_id is not null then continue; end if;
    if (v_baseline->'legacyPaymentIds') ? v_payment.id::text then continue; end if;
    v_method := public.repair_cash_method(v_payment.method);
    if v_payment.cash_posted_at is null or v_payment.recorded_by is null or v_method is null then
      raise exception 'Pago sin evidencia de proyeccion. Requiere conciliacion explicita; no se reconstruye caja historica.' using errcode='22023';
    end if;
    v_key := 'repair-payment:' || v_payment.id::text || ':collection';
    insert into public.movimientos_caja(tipo,monto,medio_pago,descripcion,referencia_tabla,referencia_id,created_by,fecha,
      repair_payment_id,repair_projection_key,repair_projection_kind,repair_projection_baseline_id)
      values('reparacion',v_payment.amount,v_method,'Cobro reparacion ' || v_order,'repairs',p_repair_id,v_payment.recorded_by,v_payment.cash_posted_at,
        v_payment.id,v_key,'collection',(v_baseline->>'auditId')::uuid)
      on conflict(repair_projection_key) where repair_projection_key is not null do nothing;
    select * into v_cash from public.movimientos_caja where repair_projection_key=v_key;
    if not found or (v_cash.monto,v_cash.medio_pago,v_cash.fecha,v_cash.created_by) is distinct from
      (v_payment.amount,v_method,v_payment.cash_posted_at,v_payment.recorded_by) then
      raise exception 'La proyeccion existente no coincide con el pago. Requiere conciliacion.' using errcode='22023';
    end if;
    update public.repair_payments set cash_movement_id=v_cash.id where id=v_payment.id;
    insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('repair_cash_projection',v_payment.id::text,'insert',v_user,
      jsonb_build_object('kind','collection','repair_id',p_repair_id,'cash_movement_id',v_cash.id,'payment',to_jsonb(v_payment)));
  end loop;
end;
$$;

create or replace function public.append_repair_cash_correction(p_repair_id uuid,p_payment_id uuid,p_reason text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_baseline jsonb; v_payment public.repair_payments; v_original public.movimientos_caja;
  v_method text; v_credit numeric; v_corrected numeric; v_cash_id uuid; v_key text := 'repair-payment:' || p_payment_id::text || ':correction';
begin
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de la correccion.' using errcode='22023'; end if;
  v_baseline := public.ensure_repair_cash_baseline(p_repair_id);
  select * into v_payment from public.repair_payments where id=p_payment_id and repair_id=p_repair_id for update;
  if not found then raise exception 'No se encontro el pago a corregir.' using errcode='P0002'; end if;
  select id into v_cash_id from public.movimientos_caja where repair_projection_key=v_key;
  if found then return v_cash_id; end if;
  v_method := public.repair_cash_method(v_payment.method);
  if v_method is null then raise exception 'Cuenta historica desconocida; requiere conciliacion.' using errcode='22023'; end if;
  if v_payment.cash_movement_id is not null then
    select * into v_original from public.movimientos_caja where id=v_payment.cash_movement_id;
    if not found or v_original.repair_payment_id is distinct from p_payment_id or v_original.repair_projection_kind is distinct from 'collection'
      or (v_original.monto,v_original.medio_pago,v_original.fecha,v_original.created_by) is distinct from (v_payment.amount,v_method,v_payment.cash_posted_at,v_payment.recorded_by) then
      raise exception 'La evidencia de caja del pago no coincide. Requiere conciliacion.' using errcode='22023';
    end if;
  elsif (v_baseline->'legacyPaymentIds') ? p_payment_id::text then
    select coalesce(sum((m->>'monto')::numeric),0) into v_credit from jsonb_array_elements(v_baseline->'cashMovements') m
      where m->>'tipo' in ('venta','reparacion','facturacion') and public.repair_cash_method(m->>'medio_pago')=v_method;
    select coalesce(sum(monto),0) into v_corrected from public.movimientos_caja
      where repair_projection_baseline_id=(v_baseline->>'auditId')::uuid and repair_projection_kind='correction'
        and corrects_cash_movement_id is null and medio_pago=v_method;
    if v_credit-v_corrected<v_payment.amount then raise exception 'Caja historica sin respaldo suficiente. Conciliar antes de corregir; no se inventa un egreso.' using errcode='22023'; end if;
  else raise exception 'Pago sin proyeccion conocida. Conciliar antes de corregir.' using errcode='22023';
  end if;
  -- Positive gasto is a signed CASH compensation under existing cash/report/salary RPCs.
  -- This is an erroneous-record correction, not a new expense record or a real refund.
  insert into public.movimientos_caja(tipo,monto,medio_pago,descripcion,referencia_tabla,referencia_id,created_by,fecha,
    repair_payment_id,repair_projection_key,repair_projection_kind,repair_projection_baseline_id,corrects_cash_movement_id)
    values('gasto',v_payment.amount,v_method,'Correccion de registro erroneo (no reembolso): ' || p_reason,'repairs',p_repair_id,v_user,clock_timestamp(),
      p_payment_id,v_key,'correction',(v_baseline->>'auditId')::uuid,v_original.id) returning id into v_cash_id;
  return v_cash_id;
end;
$$;

create or replace function public.save_repair_financial_atomic(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := public.financial_assert_admin(); v_id uuid := nullif(p_input->>'id','')::uuid;
  v_request uuid := (p_input->>'requestId')::uuid; v_replay jsonb; v_previous public.repairs; v_access uuid := nullif(p_input->>'repairAccessOrderId','')::uuid;
  v_price numeric := (p_input->>'amount')::numeric; v_paid numeric; v_action text; v_result jsonb; v_client uuid; v_posted_at timestamptz; v_precision text;
begin
  v_replay := public.financial_operation_replay(v_request,p_input,'save_repair');
  if v_replay is not null then return v_replay; end if;
  if nullif(btrim(p_input->>'customerName'),'') is null or nullif(btrim(p_input->>'device'),'') is null
    or v_price is null or v_price<0 or v_price<>round(v_price,2) or v_price::text in ('NaN','Infinity','-Infinity')
    or nullif(p_input->>'entryDate','') is null then raise exception 'Revisa los datos de la reparacion.' using errcode='22023'; end if;
  if v_id is null then
    v_action := 'insert';
    if v_access is not null then
      perform 1 from public.repair_access_orders where id=v_access for update;
      if not found then raise exception 'No se encontro la orden vinculada.' using errcode='P0002'; end if;
      if exists(select 1 from public.repairs where repair_access_order_id=v_access) then
        raise exception 'La orden ya tiene un registro financiero. Agrega la sena o saldo en ese registro.' using errcode='22023';
      end if;
    end if;
    insert into public.repairs(customer_name,device,issue_description,created_by) values(btrim(p_input->>'customerName'),btrim(p_input->>'device'),coalesce(nullif(btrim(p_input->>'issueDescription'),''),'Registro financiero'),v_user) returning id into v_id;
  else
    v_action := 'update';
    select * into v_previous from public.repairs where id=v_id for update;
    if not found then raise exception 'No se encontro la reparacion.' using errcode='P0002'; end if;
    if (p_input->>'expectedVersion')::integer is distinct from v_previous.financial_version then raise exception 'La reparacion cambio. Recarga antes de guardar.' using errcode='40001'; end if;
    if v_previous.repair_access_order_id is distinct from v_access then raise exception 'No se puede reasignar una orden financiera. Revisa el vinculo original.' using errcode='22023'; end if;
    if v_access is not null then perform 1 from public.repair_access_orders where id=v_access for update; end if;
    if exists(select 1 from public.invoices where (repair_id=v_id or repair_access_order_id=v_access) and (fiscal_reference is not null or fiscal_locked_at is not null)) then
      raise exception 'La reparacion tiene un comprobante fiscal bloqueado.' using errcode='22023';
    end if;
    v_paid := public.repair_actual_paid_total(v_id);
    if v_paid>v_price then raise exception 'El precio no puede ser menor a los cobros. Revierte primero el pago incorrecto.' using errcode='22023'; end if;
  end if;
  if v_previous.cliente_id is not null and v_previous.customer_name=btrim(p_input->>'customerName') then
    v_client := v_previous.cliente_id;
  else
    select id into v_client from public.clientes where lower(btrim(nombre))=lower(btrim(p_input->>'customerName')) order by created_at,id limit 1;
    if v_client is null then insert into public.clientes(nombre,telefono) values(btrim(p_input->>'customerName'),nullif(p_input->>'customerPhone','')) returning id into v_client; end if;
  end if;
  update public.repairs set customer_name=btrim(p_input->>'customerName'),customer_phone=nullif(p_input->>'customerPhone',''),cliente_id=v_client,device=btrim(p_input->>'device'),
    order_number=nullif(p_input->>'orderNumber',''),issue_description=coalesce(nullif(btrim(p_input->>'issueDescription'),''),'Registro financiero'),
    repair_access_order_id=v_access,estimated_price=v_price,final_price=v_price,entry_date=(p_input->>'entryDate')::date,
    financial_version=case when v_action='insert' then 1 else financial_version+1 end,updated_at=now() where id=v_id;
  if v_action='insert' then
    perform public.ensure_repair_cash_baseline(v_id);
    if jsonb_typeof(p_input->'payments') is distinct from 'array' then raise exception 'Revisa los pagos.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_input->'payments') p where p->>'method' not in ('efectivo','nx','mp') or p->>'method' is null
      or coalesce((p->>'amount')::numeric,0)<=0 or (p->>'amount')::numeric<>round((p->>'amount')::numeric,2) or (p->>'amount')::numeric::text in ('NaN','Infinity','-Infinity')) then
      raise exception 'Revisa importes y medios de pago.' using errcode='22023';
    end if;
    select coalesce(sum((p->>'amount')::numeric),0) into v_paid from jsonb_array_elements(p_input->'payments') p;
    if v_paid+public.repair_actual_paid_total(v_id)>v_price then raise exception 'Los cobros superan el precio.' using errcode='22023'; end if;
    select posted_at,timestamp_precision into v_posted_at,v_precision from public.repair_payment_posting_time((p_input->>'paymentDate')::date,p_input->>'paymentTimestamp');
    insert into public.repair_payments(repair_id,method,amount,payment_date,notes,recorded_by,cash_posted_at,cash_timestamp_precision)
      select v_id,p->>'method',(p->>'amount')::numeric,(p_input->>'paymentDate')::date,'Sena / cobro inicial',v_user,v_posted_at,v_precision from jsonb_array_elements(p_input->'payments') p;
    perform public.rebuild_repair_cash_projection(v_id);
  end if;
  perform public.sync_repair_financial_projection(v_id);
  v_result := jsonb_build_object('id',v_id,'action',v_action);
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('repairs',v_id::text,v_action,v_user,
    jsonb_build_object('operation_id',v_request,'operation','save_repair','input',p_input,'result',v_result,'previous',to_jsonb(v_previous)));
  return v_result;
end;
$$;

create or replace function public.add_repair_payment_atomic(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_id uuid := (p_input->>'repairId')::uuid; v_request uuid := (p_input->>'requestId')::uuid;
  v_replay jsonb; v_repair public.repairs; v_paid numeric; v_new numeric; v_result jsonb; v_posted_at timestamptz; v_precision text;
begin
  v_replay := public.financial_operation_replay(v_request,p_input,'add_repair_payment');
  if v_replay is not null then return v_replay; end if;
  select * into v_repair from public.repairs where id=v_id for update;
  if not found then raise exception 'No se encontro la reparacion.' using errcode='P0002'; end if;
  if v_repair.repair_access_order_id is not null then perform 1 from public.repair_access_orders where id=v_repair.repair_access_order_id for update; end if;
  if jsonb_typeof(p_input->'payments') is distinct from 'array' then raise exception 'Revisa los pagos.' using errcode='22023'; end if;
  if jsonb_array_length(p_input->'payments') not between 1 and 20 or nullif(p_input->>'paymentDate','') is null then raise exception 'Agrega un pago y su fecha.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'payments') p where p->>'method' not in ('efectivo','nx','mp') or p->>'method' is null
    or coalesce((p->>'amount')::numeric,0)<=0 or (p->>'amount')::numeric<>round((p->>'amount')::numeric,2) or (p->>'amount')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Revisa importes y medios de pago.' using errcode='22023'; end if;
  v_paid := public.repair_actual_paid_total(v_id);
  select sum((p->>'amount')::numeric) into v_new from jsonb_array_elements(p_input->'payments') p;
  if v_paid+v_new>coalesce(v_repair.final_price,v_repair.estimated_price,0) then raise exception 'El cobro supera el saldo pendiente.' using errcode='22023'; end if;
  perform public.ensure_repair_cash_baseline(v_id);
  select posted_at,timestamp_precision into v_posted_at,v_precision from public.repair_payment_posting_time((p_input->>'paymentDate')::date,p_input->>'paymentTimestamp');
  insert into public.repair_payments(repair_id,method,amount,payment_date,notes,recorded_by,cash_posted_at,cash_timestamp_precision)
    select v_id,p->>'method',(p->>'amount')::numeric,(p_input->>'paymentDate')::date,'Sena / cobro acumulativo',v_user,v_posted_at,v_precision from jsonb_array_elements(p_input->'payments') p;
  update public.repairs set financial_version=financial_version+1,updated_at=now() where id=v_id;
  perform public.rebuild_repair_cash_projection(v_id);
  perform public.sync_repair_financial_projection(v_id);
  v_result := jsonb_build_object('id',v_id,'paidTotal',v_paid+v_new);
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('repair_payments',v_id::text,'insert',v_user,
    jsonb_build_object('operation_id',v_request,'operation','add_repair_payment','input',p_input,'result',v_result));
  return v_result;
end;
$$;

create or replace function public.reverse_repair_payment_atomic(p_repair_id uuid,p_payment_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_payment public.repair_payments; v_correction uuid;
begin
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de la reversa.' using errcode='22023'; end if;
  perform 1 from public.repairs where id=p_repair_id for update;
  if not found then raise exception 'No se encontro la reparacion.' using errcode='P0002'; end if;
  select * into v_payment from public.repair_payments where id=p_payment_id and repair_id=p_repair_id for update;
  if not found then
    if exists(select 1 from public.audit_logs where entity_type='repair_payments' and entity_id=p_payment_id::text and action='delete' and changes->>'repair_id'=p_repair_id::text) then return jsonb_build_object('id',p_payment_id); end if;
    raise exception 'No se encontro el pago.' using errcode='P0002';
  end if;
  v_correction := public.append_repair_cash_correction(p_repair_id,p_payment_id,p_reason);
  update public.repair_access_payments set voided_at=now(),void_reason=p_reason where legacy_repair_payment_id=p_payment_id and voided_at is null;
  delete from public.repair_payments where id=p_payment_id;
  update public.repairs set financial_version=financial_version+1,updated_at=now() where id=p_repair_id;
  perform public.sync_repair_financial_projection(p_repair_id);
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('repair_payments',p_payment_id::text,'delete',v_user,jsonb_build_object('repair_id',p_repair_id,'reason',p_reason,'previous',to_jsonb(v_payment),'cash_correction_id',v_correction,'kind','erroneous_record_correction'));
  return jsonb_build_object('id',p_payment_id,'cashCorrectionId',v_correction);
end;
$$;

create or replace function public.delete_repair_financial_atomic(p_repair_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_repair public.repairs; v_payments jsonb;
begin
  select * into v_repair from public.repairs where id=p_repair_id for update;
  if not found then raise exception 'No se encontro la reparacion.' using errcode='P0002'; end if;
  if exists(select 1 from public.invoices where repair_id=p_repair_id or repair_access_order_id=v_repair.repair_access_order_id) then raise exception 'Conserva el registro vinculado a comprobantes. Revierte pagos individuales con motivo.' using errcode='22023'; end if;
  if exists(select 1 from public.repair_payments where repair_id=p_repair_id) then
    raise exception 'Corrige cada cobro erroneo con motivo antes de eliminar el registro. La caja historica no se elimina.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into v_payments from public.repair_payments p where repair_id=p_repair_id;
  perform public.sync_repair_financial_projection(p_repair_id);
  delete from public.repairs where id=p_repair_id;
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('repairs',p_repair_id::text,'delete',v_user,jsonb_build_object('previous',to_jsonb(v_repair),'payments',v_payments));
  return jsonb_build_object('id',p_repair_id);
end;
$$;

-- Lock parent before child for all installment mutations, preventing pay/cancel races.
create or replace function public.mutate_installment_atomic(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_id uuid := (p_input->>'id')::uuid; v_sale_id uuid;
  v_sale public.installment_sales; v_installment public.installments; v_action text := p_input->>'action'; v_paid_at timestamptz;
begin
  select installment_sale_id into v_sale_id from public.installments where id=v_id;
  if not found then raise exception 'No se encontro la cuota.' using errcode='P0002'; end if;
  select * into v_sale from public.installment_sales where id=v_sale_id for update;
  select * into v_installment from public.installments where id=v_id for update;
  if not found or v_sale.status='cancelada' then raise exception 'La venta fue cancelada o no existe.' using errcode='22023'; end if;
  if v_action='pay' then
    if p_input->>'paymentMethod' not in ('efectivo','nx','mp') or p_input->>'paymentMethod' is null or nullif(p_input->>'paidDate','') is null then raise exception 'Revisa fecha y medio de pago.' using errcode='22023'; end if;
    v_paid_at := (p_input->>'paidDate')::date::timestamp at time zone 'America/Argentina/Buenos_Aires';
    if v_installment.status='cancelada' then raise exception 'No se puede cobrar una cuota cancelada.' using errcode='22023'; end if;
    if v_installment.status='pagada' then
      if v_installment.payment_method is distinct from p_input->>'paymentMethod'
        or (v_installment.paid_at at time zone 'America/Argentina/Buenos_Aires')::date is distinct from (p_input->>'paidDate')::date then raise exception 'La cuota ya tiene un cobro diferente.' using errcode='22023'; end if;
      return jsonb_build_object('id',v_id,'replayed',true);
    end if;
    if exists(select 1 from public.movimientos_caja where referencia_tabla='installments' and referencia_id=v_id) then
      raise exception 'La cuota tiene caja preexistente sin estado de cobro consistente. Requiere conciliacion; no se reemplaza el movimiento.' using errcode='22023';
    end if;
    update public.installments set status='pagada',paid_at=v_paid_at,payment_method=p_input->>'paymentMethod',financial_version=financial_version+1,updated_at=now() where id=v_id;
    insert into public.movimientos_caja(tipo,monto,medio_pago,descripcion,referencia_tabla,referencia_id,created_by,fecha)
      values('venta',v_installment.amount,p_input->>'paymentMethod','Cuota ' || v_installment.installment_number || '/' || v_sale.installments_count || ' - ' || v_sale.customer_name || ' - ' || v_sale.product_name,'installments',v_id,v_user,v_paid_at);
  elsif v_action='update' then
    if v_installment.status in ('pagada','cancelada') then raise exception 'Una cuota cobrada o cancelada no puede editarse.' using errcode='22023'; end if;
    if (p_input->>'expectedVersion')::integer is distinct from v_installment.financial_version then raise exception 'La cuota cambio. Recarga antes de editar; no se reemplazan los datos mas recientes.' using errcode='40001'; end if;
    if coalesce((p_input->>'amount')::numeric,0)<=0 or (p_input->>'amount')::numeric<>round((p_input->>'amount')::numeric,2)
      or (p_input->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') or p_input->>'paymentMethod' not in ('efectivo','nx','mp') then raise exception 'Revisa el importe y medio de pago.' using errcode='22023'; end if;
    update public.installments set due_date=(p_input->>'dueDate')::date,amount=(p_input->>'amount')::numeric,payment_method=p_input->>'paymentMethod',notes=nullif(p_input->>'notes',''),financial_version=financial_version+1,updated_at=now() where id=v_id;
    update public.installment_sales set total_amount=(select sum(amount) from public.installments where installment_sale_id=v_sale_id) where id=v_sale_id;
  elsif v_action='cancel' then
    if v_installment.status='pagada' then raise exception 'No se puede cancelar una cuota ya pagada.' using errcode='22023'; end if;
    if v_installment.status='cancelada' then return jsonb_build_object('id',v_id,'replayed',true); end if;
    if (p_input->>'expectedVersion')::integer is distinct from v_installment.financial_version then raise exception 'La cuota cambio. Recarga antes de cancelar.' using errcode='40001'; end if;
    update public.installments set status='cancelada',paid_at=null,financial_version=financial_version+1,updated_at=now() where id=v_id;
  else raise exception 'Operacion de cuota invalida.' using errcode='22023';
  end if;
  update public.installment_sales set status=case when exists(select 1 from public.installments where installment_sale_id=v_sale_id and status not in ('pagada','cancelada')) then 'activa' else 'finalizada' end,updated_at=now() where id=v_sale_id;
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('installments',v_id::text,'update',v_user,jsonb_build_object('operation',v_action,'input',p_input,'previous',to_jsonb(v_installment)));
  return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.pay_installment_atomic(p_installment_id uuid,p_payment_method text,p_paid_date date)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.mutate_installment_atomic(jsonb_build_object('action','pay','id',p_installment_id,'paymentMethod',p_payment_method,'paidDate',p_paid_date));
$$;

create or replace function public.cancel_installment_sale_atomic(p_sale_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin();
begin
  perform 1 from public.installment_sales where id=p_sale_id for update;
  if not found then raise exception 'No se encontro la venta.' using errcode='P0002'; end if;
  update public.installment_sales set status='cancelada',updated_at=now() where id=p_sale_id;
  update public.installments set status='cancelada',financial_version=financial_version+1,updated_at=now() where installment_sale_id=p_sale_id and status not in ('pagada','cancelada');
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('installment_sales',p_sale_id::text,'update',v_user,jsonb_build_object('status','cancelada'));
  return jsonb_build_object('id',p_sale_id);
end;
$$;

-- Restrict only new financial RPCs; no existing table policies or role model changes.
create or replace function public.save_installment_sale_atomic(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := public.financial_assert_admin(); v_request uuid := (p_input->>'requestId')::uuid; v_replay jsonb;
  v_id uuid; v_result jsonb; v_total numeric := (p_input->>'totalAmount')::numeric; v_count integer := (p_input->>'installmentsCount')::integer;
begin
  v_replay := public.financial_operation_replay(v_request,p_input,'save_installment_sale');
  if v_replay is not null then return v_replay; end if;
  if nullif(btrim(p_input->>'productName'),'') is null or nullif(btrim(p_input->>'customerName'),'') is null
    or coalesce(v_total,0)<=0 or v_total::text in ('NaN','Infinity','-Infinity') or v_total<>round(v_total,2)
    or coalesce(v_count,0) not between 1 and 600 or jsonb_typeof(p_input->'installments') is distinct from 'array' then raise exception 'Revisa la venta en cuotas.' using errcode='22023'; end if;
  if jsonb_array_length(p_input->'installments')<>v_count then raise exception 'La cantidad de cuotas no coincide.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'installments') d where coalesce((d->>'amount')::numeric,0)<=0
    or (d->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') or (d->>'amount')::numeric<>round((d->>'amount')::numeric,2)
    or coalesce((d->>'installmentNumber')::integer,0) not between 1 and v_count or nullif(d->>'dueDate','') is null
    or d->>'paymentMethod' is null or d->>'paymentMethod' not in ('efectivo','nx','mp')) then raise exception 'Revisa el detalle de cuotas.' using errcode='22023'; end if;
  if (select sum((d->>'amount')::numeric) from jsonb_array_elements(p_input->'installments') d)<>v_total then raise exception 'La suma de cuotas debe coincidir con el total.' using errcode='22023'; end if;
  insert into public.installment_sales(product_name,customer_name,total_amount,installments_count,notes,created_by)
    values(btrim(p_input->>'productName'),btrim(p_input->>'customerName'),v_total,v_count,nullif(p_input->>'notes',''),v_user) returning id into v_id;
  insert into public.installments(installment_sale_id,installment_number,due_date,amount,payment_method,notes)
    select v_id,(d->>'installmentNumber')::integer,(d->>'dueDate')::date,(d->>'amount')::numeric,d->>'paymentMethod',nullif(d->>'notes','') from jsonb_array_elements(p_input->'installments') d;
  v_result := jsonb_build_object('id',v_id);
  insert into public.audit_logs(entity_type,entity_id,action,user_id,changes) values('installment_sales',v_id::text,'insert',v_user,jsonb_build_object('operation_id',v_request,'operation','save_installment_sale','input',p_input,'result',v_result));
  return v_result;
end;
$$;

-- These guards concern internal document references only, not ARCA authorization.
-- The separate fiscal adapter owns authorization snapshots and reservation lifecycle.
create or replace function public.guard_referenced_invoice_content()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.fiscal_reference is not null or old.fiscal_locked_at is not null then
    if tg_op='DELETE' then raise exception 'No se puede eliminar un documento referenciado o reservado.' using errcode='22023'; end if;
    if (old.invoice_number,old.customer_name,old.customer_phone,old.source_type,old.repair_id,old.sale_id,old.repair_access_order_id,old.subtotal,old.discount,old.total,old.notes,old.document_version)
      is distinct from (new.invoice_number,new.customer_name,new.customer_phone,new.source_type,new.repair_id,new.sale_id,new.repair_access_order_id,new.subtotal,new.discount,new.total,new.notes,new.document_version)
      or (new.status='anulado' and old.status<>'anulado') then raise exception 'El contenido del documento referenciado o reservado es inmutable.' using errcode='22023'; end if;
    if old.fiscal_reference is not null and (old.fiscal_provider,old.fiscal_reference,old.fiscal_issued_at) is distinct from (new.fiscal_provider,new.fiscal_reference,new.fiscal_issued_at) then
      raise exception 'La referencia fiscal vinculada es inmutable.' using errcode='22023';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create or replace trigger invoices_referenced_content_guard before update or delete on public.invoices
  for each row execute function public.guard_referenced_invoice_content();

create or replace function public.guard_referenced_invoice_items()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_old uuid; v_new uuid;
begin
  if tg_op<>'INSERT' then v_old := old.invoice_id; end if;
  if tg_op<>'DELETE' then v_new := new.invoice_id; end if;
  if exists(select 1 from public.invoices where id in(v_old,v_new) and (fiscal_reference is not null or fiscal_locked_at is not null)) then
    raise exception 'Los items del documento referenciado o reservado son inmutables.' using errcode='22023';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create or replace trigger invoice_items_referenced_content_guard before insert or update or delete on public.invoice_items
  for each row execute function public.guard_referenced_invoice_items();

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('financial_assert_admin','financial_operation_replay','invoice_actual_payments','repair_actual_paid_total','get_invoice_settlements','get_invoice_document','save_invoice_atomic','void_invoice_atomic','sync_repair_financial_projection','rebuild_repair_cash_projection','repair_cash_method','repair_payment_posting_time','ensure_repair_cash_baseline','append_repair_cash_correction','save_repair_financial_atomic','add_repair_payment_atomic','reverse_repair_payment_atomic','delete_repair_financial_atomic','mutate_installment_atomic','pay_installment_atomic','cancel_installment_sale_atomic','save_installment_sale_atomic','guard_referenced_invoice_content','guard_referenced_invoice_items')
  loop
    execute format('revoke all on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated, service_role',f.signature);
  end loop;
end;
$$;
