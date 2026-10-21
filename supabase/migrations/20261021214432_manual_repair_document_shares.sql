begin;

create table private.repair_document_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.repair_access_orders(id) on delete cascade,
  kind text not null check(kind in ('intake','delivery')),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=131072),
  created_by uuid not null, created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '365 days', revoked_at timestamptz
);
alter table private.repair_document_links enable row level security;
revoke all on private.repair_document_links from public,anon,authenticated;
grant all on private.repair_document_links to service_role;
create index repair_document_links_order_idx on private.repair_document_links(order_id,kind) where revoked_at is null;
create index repair_document_links_issue_rate_idx on private.repair_document_links(created_by,created_at);

-- Keep exactly the fields rendered by each approved customer PDF, even for direct RPC calls.
create function private.minimize_shared_repair_document(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb;
begin
  if p->>'kind' is null or p->>'kind' not in ('intake','delivery') or
    (p->>'kind'='delivery' and jsonb_typeof(p#>'{client,payments}') is distinct from 'array') then return null; end if;
  select jsonb_build_object('kind',p->'kind','number',p->'number','title',p->'title','date',p->'date','dateLabel','',
    'intakeDate',case when p->>'kind'='intake' then p->'date' else '""'::jsonb end,
    'budgetRevision',null,'budgetSnapshotId',null,'amount',case when p->>'kind'='delivery' then p->'amount' else 'null'::jsonb end,
    'sections','[]'::jsonb,'notice','','signatureLabel','','issuedAt',p->'issuedAt',
    'client',jsonb_build_object('name',p#>'{client,name}','equipment',p#>'{client,equipment}','model',p#>'{client,model}',
      'serial',p#>'{client,serial}','color',p#>'{client,color}',
      'phone',case when p->>'kind'='intake' then p#>'{client,phone}' else '""'::jsonb end,
      'address',case when p->>'kind'='intake' then p#>'{client,address}' else '""'::jsonb end,
      'accessories',case when p->>'kind'='intake' then p#>'{client,accessories}' else '""'::jsonb end,
      'condition',case when p->>'kind'='intake' then p#>'{client,condition}' else '""'::jsonb end,
      'fault',case when p->>'kind'='intake' then p#>'{client,fault}' else '""'::jsonb end,
      'budgetDetail',case when p->>'kind'='delivery' then p#>'{client,budgetDetail}' else '""'::jsonb end,'budget',null,
      'finalTotal',case when p->>'kind'='delivery' then p#>'{client,finalTotal}' else 'null'::jsonb end,
      'paidTotal',case when p->>'kind'='delivery' then p#>'{client,paidTotal}' else '0'::jsonb end,
      'balance',case when p->>'kind'='delivery' then p#>'{client,balance}' else 'null'::jsonb end,
      'credit',case when p->>'kind'='delivery' then p#>'{client,credit}' else '0'::jsonb end,
      'payments',case when p->>'kind'='delivery' then coalesce((select jsonb_agg(jsonb_build_object('id','','method',v->'method','amount',v->'amount','date',v->'date') order by n)
        from jsonb_array_elements(p#>'{client,payments}') with ordinality a(v,n)),'[]'::jsonb) else '[]'::jsonb end,
      'warranty',case when p->>'kind'='delivery' then jsonb_build_object('status',p#>'{client,warranty,status}','days',p#>'{client,warranty,days}',
        'startsOn',case when jsonb_typeof(p#>'{client,warranty,days}')='number' then p#>'{client,warranty,startsOn}' else 'null'::jsonb end,
        'expiresOn',case when jsonb_typeof(p#>'{client,warranty,days}')='number' then p#>'{client,warranty,expiresOn}' else 'null'::jsonb end,
        'conditions',case when jsonb_typeof(p#>'{client,warranty,days}')='number' then p#>'{client,warranty,conditions}' else '""'::jsonb end)
        else jsonb_build_object('status','none','days',null,'startsOn',null,'expiresOn',null,'conditions','') end,
      'policyStatus',case when p->>'kind'='intake' then p#>'{client,policyStatus}' else 'null'::jsonb end,
      'policy',case when p->>'kind'='intake' then p#>'{client,policy}' else 'null'::jsonb end)) into d;
  if exists(select 1 from jsonb_each(d) where key in ('kind','number','title','date','issuedAt') and jsonb_typeof(value)<>'string')
    or exists(select 1 from jsonb_each(d->'client') where key in ('name','equipment','model','serial','color','phone','address','accessories','condition','fault','budgetDetail') and jsonb_typeof(value)<>'string')
    or exists(select 1 from jsonb_each(d->'client') where key in ('finalTotal','paidTotal','balance','credit','budget') and jsonb_typeof(value) not in ('number','null'))
    or jsonb_typeof(d->'amount') not in ('number','null')
    or exists(select 1 from jsonb_each(d->'client') where key in ('policyStatus','policy') and jsonb_typeof(value) not in ('string','null'))
    or exists(select 1 from jsonb_each(d#>'{client,warranty}') where key in ('status','conditions') and jsonb_typeof(value)<>'string')
    or exists(select 1 from jsonb_each(d#>'{client,warranty}') where key in ('startsOn','expiresOn') and jsonb_typeof(value) not in ('string','null'))
    or jsonb_typeof(d#>'{client,warranty,days}') not in ('number','null')
    or d#>>'{client,warranty,status}' not in ('none','pending_delivery','active','expires_today','expired','needs_review')
    or exists(select 1 from jsonb_array_elements(d#>'{client,payments}') v where
      jsonb_typeof(v->'method') is distinct from 'string' or jsonb_typeof(v->'amount') is distinct from 'number'
      or jsonb_typeof(v->'date') not in ('string','null')) then return null; end if;
  return d;
end;
$$;
revoke all on function private.minimize_shared_repair_document(jsonb) from public,anon,authenticated;

create function private.issue_repair_document_link(p_order_id uuid,p_kind text,p_token_hash text,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_id uuid; v_expires timestamptz; v_document jsonb;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede compartir comprobantes.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id;
  if p_kind is null or p_kind not in ('intake','delivery') or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>131072
    or p_document->>'kind' is distinct from p_kind or p_document->>'number' is distinct from v_order.repair_number
    or jsonb_typeof(p_document->'client') is distinct from 'object' then raise exception 'Comprobante no valido.' using errcode='23514'; end if;
  if p_kind='delivery' and v_order.picked_up_at is null and v_order.delivered_at is null then
    raise exception 'Registra primero la entrega real del equipo.' using errcode='23514';
  end if;
  v_document:=private.minimize_shared_repair_document(p_document);
  if v_document is null then raise exception 'Los datos del comprobante no son validos.' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('receipt-share:'||auth.uid()::text,0));
  if (select count(*) from private.repair_document_links where created_by=auth.uid() and created_at>now()-interval '1 minute')>=30 then
    raise exception 'Espera un minuto antes de compartir otro comprobante.' using errcode='54000';
  end if;
  insert into private.repair_document_links(order_id,kind,token_hash,document,created_by)
    values(p_order_id,p_kind,p_token_hash,v_document,auth.uid()) returning id,expires_at into v_id,v_expires;
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id) values('repair_access_orders',p_order_id::text,'update',
    jsonb_build_object('operation','manual_receipt_link_created','link_id',v_id,'kind',p_kind,'expires_at',v_expires),auth.uid());
  return jsonb_build_object('expiresAt',v_expires);
end $$;
create function public.issue_repair_document_link(p_order_id uuid,p_kind text,p_token_hash text,p_document jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.issue_repair_document_link(p_order_id,p_kind,p_token_hash,p_document) $$;
revoke all on function private.issue_repair_document_link(uuid,text,text,jsonb),public.issue_repair_document_link(uuid,text,text,jsonb) from public,anon;
grant execute on function private.issue_repair_document_link(uuid,text,text,jsonb),public.issue_repair_document_link(uuid,text,text,jsonb) to authenticated;

create function private.revoke_repair_document_links(p_order_id uuid,p_kind text) returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede desactivar enlaces.' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('intake','delivery') then raise exception 'Comprobante no valido.' using errcode='23514'; end if;
  update private.repair_document_links set revoked_at=now() where order_id=p_order_id and kind=p_kind and revoked_at is null;
  get diagnostics v_count=row_count;
  if v_count>0 then insert into public.audit_logs(entity_type,entity_id,action,changes,user_id) values('repair_access_orders',p_order_id::text,'update',
    jsonb_build_object('operation','manual_receipt_links_revoked','kind',p_kind,'count',v_count),auth.uid()); end if;
  return v_count;
end $$;
create function public.revoke_repair_document_links(p_order_id uuid,p_kind text) returns integer language sql security invoker set search_path='' as $$ select private.revoke_repair_document_links(p_order_id,p_kind) $$;
revoke all on function private.revoke_repair_document_links(uuid,text),public.revoke_repair_document_links(uuid,text) from public,anon;
grant execute on function private.revoke_repair_document_links(uuid,text),public.revoke_repair_document_links(uuid,text) to authenticated;

-- The anonymous role gets no access to the existing private schema or its functions.
create schema document_access;
revoke all on schema document_access from public,anon,authenticated;
grant usage on schema document_access to anon,authenticated;
create function document_access.read_repair_document_link(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  return (select jsonb_build_object('document',private.minimize_shared_repair_document(document),'expiresAt',expires_at)
    from private.repair_document_links where token_hash=encode(pg_catalog.sha256(convert_to(p_token,'UTF8')),'hex')
    and revoked_at is null and expires_at>now());
end $$;
create function public.read_repair_document_link(p_token text) returns jsonb language sql stable security invoker set search_path='' as $$ select document_access.read_repair_document_link(p_token) $$;
revoke all on function document_access.read_repair_document_link(text),public.read_repair_document_link(text) from public,anon,authenticated;
grant execute on function document_access.read_repair_document_link(text),public.read_repair_document_link(text) to anon,authenticated;

commit;
