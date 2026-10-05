-- Only the backend service role may claim, reserve or finish an issuance.
-- No ARCA credentials, tickets, SOAP payloads, cash or stock changes are stored here.
create schema if not exists private;
alter table public.invoices
  add column if not exists repair_access_order_id uuid references public.repair_access_orders(id) on delete restrict,
  add column if not exists document_version integer not null default 1,
  add column if not exists fiscal_provider text,
  add column if not exists fiscal_reference text,
  add column if not exists fiscal_issued_at timestamptz,
  add column if not exists fiscal_locked_at timestamptz;
alter table public.invoice_items add column if not exists position integer not null default 0;

create function private.fiscal_valid_cuit(p_cuit text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_weights integer[]:=array[5,4,3,2,7,6,5,4,3,2]; v_sum integer:=0; v_check integer; i integer;
begin
  if not coalesce(p_cuit ~ '^[1-9][0-9]{10}$',false) then return false; end if;
  for i in 1..10 loop v_sum:=v_sum+substring(p_cuit from i for 1)::integer*v_weights[i]; end loop;
  v_check:=(11-v_sum%11)%11;
  if v_check=10 then v_check:=9; end if;
  return v_check=substring(p_cuit from 11 for 1)::integer;
end;
$$;

create table public.fiscal_issuance_records (
  id uuid primary key,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  environment text not null check(environment in ('homologation','production')),
  issuer_cuit text not null check(private.fiscal_valid_cuit(issuer_cuit)),
  point_of_sale integer not null check(point_of_sale between 1 and 99999 and (environment<>'production' or point_of_sale<>1)),
  voucher_type integer not null check(voucher_type=11),
  status text not null check(status in ('claimed','prepared','submitting','uncertain','accepted','rejected')),
  snapshot jsonb not null,
  snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
  voucher_number bigint check(voucher_number between 1 and 99999999),
  cae_authorization jsonb,
  error_codes jsonb not null default '[]'::jsonb,
  claim_token uuid,
  lease_until timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status<>'accepted' or coalesce((voucher_number is not null and cae_authorization is not null and cae_authorization->>'cae' ~ '^[1-9][0-9]{13}$' and cae_authorization->>'expiresOn' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),false))
);
create unique index fiscal_one_live_invoice_environment on public.fiscal_issuance_records(invoice_id,environment) where status<>'rejected';
create unique index fiscal_one_reserved_number on public.fiscal_issuance_records(environment,issuer_cuit,point_of_sale,voucher_type,voucher_number) where status<>'rejected';
create index fiscal_records_created_idx on public.fiscal_issuance_records(invoice_id,created_at desc);

create table public.fiscal_issuance_counters (
  environment text not null, issuer_cuit text not null, point_of_sale integer not null, voucher_type integer not null,
  active_record_id uuid references public.fiscal_issuance_records(id) on delete restrict,
  last_authorized_number bigint not null default 0,
  primary key(environment,issuer_cuit,point_of_sale,voucher_type)
);
alter table public.fiscal_issuance_records enable row level security;
alter table public.fiscal_issuance_counters enable row level security;
revoke all on public.fiscal_issuance_records,public.fiscal_issuance_counters from public,anon,authenticated;
grant select(id,invoice_id,environment,issuer_cuit,point_of_sale,voucher_type,status,snapshot,snapshot_hash,voucher_number,cae_authorization,error_codes,created_by,created_at,updated_at) on public.fiscal_issuance_records to authenticated;
grant all on public.fiscal_issuance_records,public.fiscal_issuance_counters to service_role;
create policy fiscal_admin_read on public.fiscal_issuance_records for select to authenticated using((select private.is_admin()));
grant usage on schema private to service_role;

create function private.fiscal_record_json(r public.fiscal_issuance_records)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',r.id,'invoiceId',r.invoice_id,'status',r.status,'snapshot',r.snapshot,
    'snapshotHash',r.snapshot_hash,'number',r.voucher_number,'authorization',r.cae_authorization,'errorCodes',r.error_codes);
$$;

create function private.fiscal_assert_document(p_id uuid,p_snapshot jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare i public.invoices; v_items jsonb;
begin
  select * into i from public.invoices where id=p_id for update;
  if not found or i.status='anulado' or i.fiscal_reference is not null
    or i.source_type not in ('sale','repair','repair_access') or (i.source_type='sale' and i.sale_id is null) or (i.source_type='repair' and i.repair_id is null)
    or (i.source_type='repair_access' and (i.repair_access_order_id is null or (p_snapshot->>'concept')::integer is distinct from 2)) then
    raise exception 'El documento no es una venta/reparacion elegible.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unitPriceCents',unit_price*100,'totalCents',total*100) order by position,id),'[]'::jsonb)
    into v_items from public.invoice_items where invoice_id=p_id;
  if p_snapshot->>'invoiceId' is distinct from i.id::text or p_snapshot->>'invoiceNumber' is distinct from i.invoice_number
    or p_snapshot->>'documentCustomerName' is distinct from i.customer_name
    or (p_snapshot->>'documentVersion')::integer is distinct from i.document_version
    or p_snapshot->>'sourceType' is distinct from i.source_type
    or p_snapshot->>'repairId' is distinct from i.repair_id::text or p_snapshot->>'saleId' is distinct from i.sale_id::text
    or p_snapshot->>'repairAccessOrderId' is distinct from i.repair_access_order_id::text
    or (p_snapshot->>'subtotalCents')::numeric is distinct from i.subtotal*100
    or (p_snapshot->>'discountCents')::numeric is distinct from i.discount*100
    or (p_snapshot->>'totalCents')::numeric is distinct from i.total*100
    or i.total<=0 or i.total<>i.subtotal-i.discount or p_snapshot->'items' is distinct from v_items then
    raise exception 'El comprobante cambio desde la vista previa. Recarga antes de emitir.' using errcode='40001';
  end if;
end;
$$;

create function private.fiscal_claim(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb:=p_input->'snapshot'; v_id uuid:=(p_input->>'requestId')::uuid; v_user uuid:=(p_input->>'userId')::uuid;
  v_invoice uuid:=(s->>'invoiceId')::uuid; v_env text:=s->>'environment'; v_cuit text:=s->'issuer'->>'cuit';
  v_pv integer:=(s->>'pointOfSale')::integer; v_hash text:=p_input->>'snapshotHash';
  v_record public.fiscal_issuance_records; v_active uuid; v_token uuid:=gen_random_uuid();
begin
  if v_id is null or v_user is null or not exists(select 1 from public.profiles where id=v_user and role='admin')
    or v_env not in ('homologation','production') or not private.fiscal_valid_cuit(v_cuit) or v_pv not between 1 and 99999 or (v_env='production' and v_pv=1)
    or (s->>'voucherType')::integer<>11 or v_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Solicitud fiscal invalida.' using errcode='22023';
  end if;
  -- Persistent active_record_id outlives the transaction and every application worker.
  perform pg_advisory_xact_lock(hashtextextended('fiscal:'||v_env||':'||v_cuit||':'||v_pv::text||':11',0));
  insert into public.fiscal_issuance_counters(environment,issuer_cuit,point_of_sale,voucher_type) values(v_env,v_cuit,v_pv,11) on conflict do nothing;
  select active_record_id into v_active from public.fiscal_issuance_counters where environment=v_env and issuer_cuit=v_cuit and point_of_sale=v_pv and voucher_type=11 for update;
  select * into v_record from public.fiscal_issuance_records where id=v_id for update;
  if found then
    if v_record.snapshot_hash is distinct from v_hash or v_record.snapshot is distinct from s or v_record.invoice_id<>v_invoice then
      raise exception 'Identificador fiscal reutilizado con datos distintos.' using errcode='22023';
    end if;
    if v_record.status='accepted' then return jsonb_build_object('kind','accepted','record',private.fiscal_record_json(v_record)); end if;
    if v_record.status='rejected' then raise exception 'Intento rechazado: crea otra vista previa corregida.' using errcode='22023'; end if;
    if v_record.lease_until>clock_timestamp() then return jsonb_build_object('kind','busy','record',private.fiscal_record_json(v_record)); end if;
  else
    if v_active is not null then raise exception 'Hay una emision pendiente en esta serie. Consulta su resultado primero.' using errcode='55P03'; end if;
    perform private.fiscal_assert_document(v_invoice,s);
    insert into public.fiscal_issuance_records(id,invoice_id,environment,issuer_cuit,point_of_sale,voucher_type,status,snapshot,snapshot_hash,claim_token,lease_until,created_by)
      values(v_id,v_invoice,v_env,v_cuit,v_pv,11,'claimed',s,v_hash,v_token,clock_timestamp()+interval '2 minutes',v_user) returning * into v_record;
  end if;
  if v_active is not null and v_active<>v_id then raise exception 'Serie ocupada.' using errcode='55P03'; end if;
  update public.fiscal_issuance_records set claim_token=v_token,lease_until=clock_timestamp()+interval '2 minutes',updated_at=now() where id=v_id returning * into v_record;
  update public.fiscal_issuance_counters set active_record_id=v_id where environment=v_env and issuer_cuit=v_cuit and point_of_sale=v_pv and voucher_type=11;
  return jsonb_build_object('kind','acquired','record',private.fiscal_record_json(v_record),'token',v_token);
end;
$$;

create function private.fiscal_prepare(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.fiscal_issuance_records; v_number bigint:=(p_input->>'number')::bigint;
begin
  select * into r from public.fiscal_issuance_records where id=(p_input->>'id')::uuid for update;
  if not found or r.claim_token is distinct from (p_input->>'token')::uuid or r.lease_until<=clock_timestamp() or r.status<>'claimed' or r.voucher_number is not null or v_number not between 1 and 99999999 then
    raise exception 'Reserva fiscal invalida o vencida.' using errcode='40001';
  end if;
  perform private.fiscal_assert_document(r.invoice_id,r.snapshot);
  update public.fiscal_issuance_records set voucher_number=v_number,status='prepared',updated_at=now() where id=r.id returning * into r;
  return private.fiscal_record_json(r);
end;
$$;

create function private.fiscal_mark_submitting(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.fiscal_issuance_records;
begin
  select * into r from public.fiscal_issuance_records where id=(p_input->>'id')::uuid for update;
  if not found or r.claim_token is distinct from (p_input->>'token')::uuid or r.lease_until<=clock_timestamp() or r.voucher_number is null or r.status not in ('prepared','uncertain','submitting') then
    raise exception 'Reclamo fiscal invalido o vencido.' using errcode='40001';
  end if;
  update public.fiscal_issuance_records set status='submitting',lease_until=clock_timestamp()+interval '2 minutes',updated_at=now() where id=r.id;
  return '{}'::jsonb;
end;
$$;

create function private.fiscal_finish(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.fiscal_issuance_records; o jsonb:=p_input->'outcome'; a jsonb:=o->'authorization'; v_status text:=o->>'status';
begin
  select * into r from public.fiscal_issuance_records where id=(p_input->>'id')::uuid;
  if not found then raise exception 'Registro fiscal inexistente.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fiscal:'||r.environment||':'||r.issuer_cuit||':'||r.point_of_sale::text||':11',0));
  perform 1 from public.fiscal_issuance_counters where environment=r.environment and issuer_cuit=r.issuer_cuit and point_of_sale=r.point_of_sale and voucher_type=r.voucher_type for update;
  select * into r from public.fiscal_issuance_records where id=(p_input->>'id')::uuid for update;
  if not found or r.status in ('accepted','rejected') or r.claim_token is distinct from (p_input->>'token')::uuid or v_status not in ('accepted','rejected','uncertain') then
    raise exception 'Finalizacion fiscal invalida.' using errcode='40001';
  end if;
  if v_status='accepted' and (r.voucher_number is null or a is null or coalesce(a->>'cae','') !~ '^[1-9][0-9]{13}$' or (a->>'number')::bigint is distinct from r.voucher_number or coalesce(a->>'expiresOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'Falta autorizacion CAE verificable.' using errcode='22023';
  end if;
  if v_status='uncertain' and r.voucher_number is null then raise exception 'No hay numero reservado.' using errcode='22023'; end if;
  update public.fiscal_issuance_records set status=v_status,cae_authorization=case when v_status='accepted' then a else null end,
    error_codes=coalesce(o->'codes','[]'::jsonb),claim_token=case when v_status='uncertain' then claim_token else null end,
    lease_until=case when v_status='uncertain' then clock_timestamp()+interval '2 minutes' else clock_timestamp() end,updated_at=now() where id=r.id returning * into r;
  if v_status<>'uncertain' then
    update public.fiscal_issuance_counters set active_record_id=null,last_authorized_number=case when v_status='accepted' then greatest(last_authorized_number,r.voucher_number) else last_authorized_number end
      where environment=r.environment and issuer_cuit=r.issuer_cuit and point_of_sale=r.point_of_sale and voucher_type=r.voucher_type and active_record_id=r.id;
  end if;
  if v_status='accepted' and r.environment='production' then
    update public.invoices set fiscal_provider='ARCA WSFEv1',fiscal_reference=lpad(r.point_of_sale::text,5,'0')||'-'||lpad(r.voucher_number::text,8,'0'),fiscal_issued_at=now(),fiscal_locked_at=now() where id=r.invoice_id;
  end if;
  return private.fiscal_record_json(r);
end;
$$;

create function private.fiscal_guard_record()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or old.status='accepted' or new.snapshot is distinct from old.snapshot or new.snapshot_hash is distinct from old.snapshot_hash
    or (new.id,new.invoice_id,new.environment,new.issuer_cuit,new.point_of_sale,new.voucher_type,new.created_by) is distinct from
       (old.id,old.invoice_id,old.environment,old.issuer_cuit,old.point_of_sale,old.voucher_type,old.created_by)
    or (old.voucher_number is not null and new.voucher_number is distinct from old.voucher_number) then
    raise exception 'El registro y snapshot fiscal son inmutables.' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger fiscal_record_immutable before update or delete on public.fiscal_issuance_records for each row execute function private.fiscal_guard_record();

create function private.fiscal_guard_document()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_old uuid; v_new uuid;
begin
  if tg_table_name='invoice_items' then
    if tg_op<>'INSERT' then v_old:=old.invoice_id; end if;
    if tg_op<>'DELETE' then v_new:=new.invoice_id; end if;
    -- Parent row locking also serializes detail edits against claim/prepare.
    perform 1 from public.invoices where id in(v_old,v_new) order by id for update;
  else
    v_old:=old.id;
    if tg_op='UPDATE' and (new.invoice_number,new.customer_name,new.source_type,new.repair_id,new.sale_id,new.repair_access_order_id,new.subtotal,new.discount,new.total,new.notes,new.document_version,new.status='anulado') is not distinct from
      (old.invoice_number,old.customer_name,old.source_type,old.repair_id,old.sale_id,old.repair_access_order_id,old.subtotal,old.discount,old.total,old.notes,old.document_version,old.status='anulado') then return new; end if;
  end if;
  if exists(select 1 from public.fiscal_issuance_records where invoice_id in(v_old,v_new) and (status in ('claimed','prepared','submitting','uncertain') or (status='accepted' and environment='production'))) then
    raise exception 'El contenido esta reservado o autorizado fiscalmente. Conserva el documento.' using errcode='22023';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger fiscal_invoice_content_guard before update or delete on public.invoices for each row execute function private.fiscal_guard_document();
create trigger fiscal_invoice_items_guard before insert or update or delete on public.invoice_items for each row execute function private.fiscal_guard_document();

-- Exposed RPCs are invoker wrappers, never security-definer entry points.
create function public.fiscal_claim(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.fiscal_claim(p_input); $$;
create function public.fiscal_prepare(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.fiscal_prepare(p_input); $$;
create function public.fiscal_mark_submitting(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.fiscal_mark_submitting(p_input); $$;
create function public.fiscal_finish(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.fiscal_finish(p_input); $$;
revoke all on function public.fiscal_claim(jsonb),public.fiscal_prepare(jsonb),public.fiscal_mark_submitting(jsonb),public.fiscal_finish(jsonb) from public,anon,authenticated;
grant execute on function public.fiscal_claim(jsonb),public.fiscal_prepare(jsonb),public.fiscal_mark_submitting(jsonb),public.fiscal_finish(jsonb) to service_role;
revoke all on function private.fiscal_record_json(public.fiscal_issuance_records),private.fiscal_assert_document(uuid,jsonb),private.fiscal_claim(jsonb),private.fiscal_prepare(jsonb),private.fiscal_mark_submitting(jsonb),private.fiscal_finish(jsonb),private.fiscal_guard_record(),private.fiscal_guard_document() from public,anon,authenticated;
grant execute on function private.fiscal_record_json(public.fiscal_issuance_records),private.fiscal_assert_document(uuid,jsonb),private.fiscal_claim(jsonb),private.fiscal_prepare(jsonb),private.fiscal_mark_submitting(jsonb),private.fiscal_finish(jsonb),private.fiscal_guard_record() to service_role;
revoke all on function private.fiscal_valid_cuit(text) from public,anon,authenticated;
grant execute on function private.fiscal_valid_cuit(text) to service_role;
