begin;

alter table public.repair_access_orders add column whatsapp_document_consent boolean not null default false;
alter table public.repair_access_orders add column whatsapp_consent_recorded_at timestamptz;
alter table public.repair_access_orders add column whatsapp_consent_phone text;

create table private.whatsapp_automation_config (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false,
  activated_at timestamptz, webhook_verified_at timestamptz
);
insert into private.whatsapp_automation_config(singleton) values(true);
revoke all on private.whatsapp_automation_config from public,anon,authenticated;
grant all on private.whatsapp_automation_config to service_role;

create table public.repair_document_deliveries (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.repair_access_orders(id) on delete cascade,
  kind text not null check(kind in ('intake','delivery')),
  status text not null default 'pending' check(status in ('pending','processing','submitting','retry','accepted','delivered','read','blocked','failed','uncertain','cancelled')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz, provider_message_id text unique,
  error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  accepted_at timestamptz, delivered_at timestamptz, read_at timestamptz,
  submission_started_at timestamptz, recovered_at timestamptz,
  unique(order_id,kind)
);
alter table public.repair_document_deliveries enable row level security;
revoke all on public.repair_document_deliveries from public,anon,authenticated;
grant select on public.repair_document_deliveries to authenticated;
grant all on public.repair_document_deliveries to service_role;
create policy repair_document_admin_read on public.repair_document_deliveries for select to authenticated
  using ((select private.is_admin()));
create index repair_document_pending_idx on public.repair_document_deliveries(next_attempt_at,created_at)
  where status in ('pending','retry','processing','submitting');

create table private.repair_document_snapshots (
  job_id uuid primary key references public.repair_document_deliveries(id) on delete cascade,
  payload jsonb not null, recipient text not null, media_id text
);
create table private.whatsapp_recipient_optouts(phone text primary key, recorded_at timestamptz not null default now());
create table private.repair_document_snapshot_history (
  id bigint generated always as identity primary key, job_id uuid not null references public.repair_document_deliveries(id) on delete cascade,
  payload jsonb not null, recipient text not null, superseded_at timestamptz not null default now(), changed_by uuid
);
revoke all on private.repair_document_snapshot_history from public,anon,authenticated;
grant all on private.repair_document_snapshot_history to service_role;
revoke all on private.repair_document_snapshots,private.whatsapp_recipient_optouts from public,anon,authenticated;
grant all on private.repair_document_snapshots,private.whatsapp_recipient_optouts to service_role;

create function private.whatsapp_document_phone(p_phone text) returns text language plpgsql immutable set search_path='' as $$
declare v text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if left(v,2)='00' then v:=substr(v,3); end if;
  if left(v,1)='0' then v:=substr(v,2); end if;
  if left(v,3)='549' and length(v)=13 then return v; end if;
  if left(v,2)='54' and length(v)=12 then return '549'||substr(v,3); end if;
  if length(v)=10 and left(v,1) not in ('0','9') then return '549'||v; end if;
  return '';
end $$;

-- Only customer-facing data is retained. Both payment ledgers are read in this transaction.
create function private.whatsapp_document_snapshot(p_order_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'document_generated_at',now(),
    'id',o.id,'repair_number',o.repair_number,'intake_date',o.intake_date,'issue_reported',o.issue_reported,
    'budget_amount',o.budget_amount,'budget_detail',o.budget_detail,'final_amount',o.final_amount,
    'picked_up_at',o.picked_up_at,'delivered_at',o.delivered_at,'status',o.status,
    'has_warranty',o.has_warranty,'warranty_days',o.warranty_days,'warranty_start',o.warranty_start,
    'warranty_until',o.warranty_until,'warranty_conditions',o.warranty_conditions,'warranty_requires_review',o.warranty_requires_review,
    'repair_access_customers',jsonb_build_object('full_name',c.full_name,'phone',c.phone,'address',c.address),
    'repair_access_devices',jsonb_build_object('device_type',d.device_type,'brand',d.brand,'model',d.model,'color',d.color,
      'serial_number',d.serial_number,'accessory_details',d.accessory_details,'visual_condition',d.visual_condition),
    'repairs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'final_price',r.final_price,'estimated_price',r.estimated_price,
      'repair_payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'method',p.method,'amount',p.amount,'payment_date',p.payment_date,'created_at',p.created_at) order by p.created_at,p.id)
        from public.repair_payments p where p.repair_id=r.id),'[]'::jsonb))) from public.repairs r where r.repair_access_order_id=o.id),'[]'::jsonb),
    'repair_access_payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'method',p.method,'amount',p.amount,'payment_date',p.payment_date,'created_at',p.created_at,
      'legacy_repair_payment_id',p.legacy_repair_payment_id,'voided_at',p.voided_at) order by p.created_at,p.id) from public.repair_access_payments p where p.repair_order_id=o.id),'[]'::jsonb)
  ) from public.repair_access_orders o join public.repair_access_customers c on c.id=o.customer_id
    join public.repair_access_devices d on d.id=o.device_id where o.id=p_order_id;
$$;

-- Activation provisions Vault secrets and pg_net. Missing infrastructure never prevents an intake.
create function private.whatsapp_wake_worker() returns void language plpgsql security definer set search_path='' as $$
declare v_url text; v_key text;
begin
  if not exists(select 1 from private.whatsapp_automation_config where enabled) then return; end if;
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1' into v_url using 'chetech_whatsapp_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1' into v_key using 'chetech_whatsapp_worker_token';
  if v_url is null or v_key is null then return; end if;
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=5000)'
    using v_url,jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),'{}'::jsonb;
exception when others then
  -- The durable outbox is retried by Cron; a network failure must not undo the repair.
  return;
end $$;

create function private.whatsapp_enqueue_document(p_order_id uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_payload jsonb; v_id uuid; v_phone text;
begin
  if (select private.is_admin()) is not true and coalesce(auth.role(),'')<>'service_role' then raise exception 'Solo mostrador puede preparar documentos.' using errcode='42501'; end if;
  if p_kind not in ('intake','delivery') then raise exception 'Invalid document kind'; end if;
  if not exists(select 1 from private.whatsapp_automation_config where enabled) then return; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id;
  if not v_order.whatsapp_document_consent or (p_kind='intake' and v_order.import_source is not null) then return; end if;
  v_payload:=private.whatsapp_document_snapshot(p_order_id);
  v_phone:=private.whatsapp_document_phone(v_payload#>>'{repair_access_customers,phone}');
  if exists(select 1 from private.whatsapp_recipient_optouts where phone=v_phone) then return; end if;
  insert into public.repair_document_deliveries(order_id,kind,status,error_code)
    values(p_order_id,p_kind,case when v_phone='' or v_order.whatsapp_consent_phone is distinct from v_phone then 'blocked' else 'pending' end,
      case when v_phone='' then 'invalid_phone' when v_order.whatsapp_consent_phone is distinct from v_phone then 'recipient_or_consent_changed' end)
    on conflict(order_id,kind) do nothing returning id into v_id;
  if v_id is null then return; end if;
  insert into private.repair_document_snapshots(job_id,payload,recipient) values(v_id,v_payload,v_phone);
  perform private.whatsapp_wake_worker();
end $$;

create function public.save_repair_access_intake_with_documents(p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb; v_id uuid; v_consent boolean; v_phone text;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede guardar ingresos.' using errcode='42501'; end if;
  v_result:=public.save_repair_access_intake(p_payload); v_id:=(v_result->>'id')::uuid;
  if p_payload ? 'whatsapp_document_consent' then
    v_consent:=(p_payload->>'whatsapp_document_consent')::boolean;
    select case when v_consent then private.whatsapp_document_phone(c.phone) else null end into v_phone
      from public.repair_access_orders o join public.repair_access_customers c on c.id=o.customer_id where o.id=v_id;
    update public.repair_access_orders set whatsapp_document_consent=v_consent,
      whatsapp_consent_phone=v_phone,whatsapp_consent_recorded_at=case when v_consent then now() else null end
      where id=v_id and (whatsapp_document_consent is distinct from v_consent or whatsapp_consent_phone is distinct from v_phone);
  end if;
  if nullif(p_payload->>'id','') is null then perform private.whatsapp_enqueue_document(v_id,'intake'); end if;
  return v_result;
end $$;
revoke all on function public.save_repair_access_intake_with_documents(jsonb) from public,anon;
grant execute on function public.save_repair_access_intake_with_documents(jsonb) to authenticated;

create function private.whatsapp_document_pickup_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='retirado' and new.picked_up_at is not null and old.picked_up_at is null and old.delivered_at is null
    and new.imported_at is not distinct from old.imported_at and auth.uid() is not null then perform private.whatsapp_enqueue_document(new.id,'delivery'); end if;
  return new;
end $$;
create trigger repair_document_first_pickup after update on public.repair_access_orders
  for each row execute function private.whatsapp_document_pickup_trigger();

create function private.whatsapp_consent_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.whatsapp_document_consent is distinct from old.whatsapp_document_consent or new.whatsapp_consent_recorded_at is distinct from old.whatsapp_consent_recorded_at
      or new.whatsapp_consent_phone is distinct from old.whatsapp_consent_phone)
    and (select private.is_admin()) is not true and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'El permiso para enviar comprobantes se registra desde mostrador.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger repair_document_consent_guard before update on public.repair_access_orders
  for each row execute function private.whatsapp_consent_guard();

create function private.whatsapp_service_assert() returns void language plpgsql stable set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker access required' using errcode='42501'; end if;
end $$;

create function private.whatsapp_claim_document() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.repair_document_deliveries%rowtype; v_snapshot private.repair_document_snapshots%rowtype; v_current_phone text;
begin
  perform private.whatsapp_service_assert();
  if not exists(select 1 from private.whatsapp_automation_config where enabled) then return null; end if;
  update public.repair_document_deliveries set status='uncertain',error_code='submission_interrupted',updated_at=now()
    where status='submitting' and lease_until<now();
  update public.repair_document_deliveries set status='failed',error_code='attempts_exhausted',updated_at=now()
    where status='processing' and lease_until<now() and attempts>=5;
  select * into v_job from public.repair_document_deliveries
    where (status in ('pending','retry') or (status='processing' and lease_until<now())) and next_attempt_at<=now()
    and coalesce(recovered_at,created_at)>=(select activated_at from private.whatsapp_automation_config) and attempts<5
    order by created_at,id for update skip locked limit 1;
  if v_job.id is null then return null; end if;
  select * into strict v_snapshot from private.repair_document_snapshots where job_id=v_job.id;
  select private.whatsapp_document_phone(c.phone) into v_current_phone from public.repair_access_orders o
    join public.repair_access_customers c on c.id=o.customer_id where o.id=v_job.order_id and o.whatsapp_document_consent and o.whatsapp_consent_phone=v_snapshot.recipient;
  if v_current_phone is distinct from v_snapshot.recipient or exists(select 1 from private.whatsapp_recipient_optouts where phone=v_current_phone) then
    update public.repair_document_deliveries set status='blocked',error_code='recipient_or_consent_changed',updated_at=now() where id=v_job.id;
    return jsonb_build_object('skipped',true);
  end if;
  update public.repair_document_deliveries set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now()
    where id=v_job.id returning * into v_job;
  return to_jsonb(v_job)||jsonb_build_object('snapshot',v_snapshot.payload,'recipient',v_snapshot.recipient,'media_id',v_snapshot.media_id);
end $$;
create function public.whatsapp_claim_document() returns jsonb language sql set search_path='' as $$ select private.whatsapp_claim_document() $$;

create function private.whatsapp_update_document(p_id uuid,p_lease uuid,p_action text,p_value text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare v_job public.repair_document_deliveries%rowtype;
begin
  perform private.whatsapp_service_assert();
  select * into v_job from public.repair_document_deliveries where id=p_id for update;
  if v_job.lease_token is distinct from p_lease then return false; end if;
  if p_action='media' and v_job.status='processing' then
    update private.repair_document_snapshots set media_id=p_value where job_id=p_id; return true;
  elsif p_action in ('prepare','submitting') and v_job.status='processing' then
    if v_job.lease_until<now() or not exists(select 1 from private.whatsapp_automation_config where enabled) then return false; end if;
    if not exists(select 1 from public.repair_access_orders o join public.repair_access_customers c on c.id=o.customer_id
      join private.repair_document_snapshots s on s.job_id=p_id where o.id=v_job.order_id and o.whatsapp_document_consent
      and o.whatsapp_consent_phone=s.recipient
      and private.whatsapp_document_phone(c.phone)=s.recipient and not exists(select 1 from private.whatsapp_recipient_optouts where phone=s.recipient)) then
      update public.repair_document_deliveries set status='blocked',error_code='recipient_or_consent_changed',updated_at=now() where id=p_id; return false;
    end if;
    if p_action='prepare' then return true; end if;
    update public.repair_document_deliveries set status='submitting',submission_started_at=now(),updated_at=now() where id=p_id; return true;
  elsif p_action='accepted' and v_job.status in ('submitting','uncertain','accepted','delivered','read') then
    update public.repair_document_deliveries set status=case when status in ('delivered','read') then status else 'accepted' end,
      provider_message_id=coalesce(provider_message_id,p_value),accepted_at=coalesce(accepted_at,now()),error_code=null,updated_at=now() where id=p_id; return true;
  elsif p_action in ('retry','failed','uncertain','blocked') and v_job.status in ('processing','submitting') then
    update public.repair_document_deliveries set status=case when p_action='retry' and attempts>=5 then 'failed' else p_action end,
      error_code=left(p_value,80),next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),updated_at=now() where id=p_id; return true;
  end if;
  return false;
end $$;
create function public.whatsapp_update_document(p_id uuid,p_lease uuid,p_action text,p_value text default null) returns boolean language sql set search_path='' as $$ select private.whatsapp_update_document(p_id,p_lease,p_action,p_value) $$;

create function private.whatsapp_document_status(p_message_id text,p_job_id uuid,p_status text,p_recipient text,p_timestamp timestamptz,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_job public.repair_document_deliveries%rowtype;
begin
  perform private.whatsapp_service_assert();
  select j.* into v_job from public.repair_document_deliveries j join private.repair_document_snapshots s on s.job_id=j.id
    where (j.provider_message_id=p_message_id or (j.id=p_job_id and j.status in ('submitting','uncertain','accepted','delivered','read')))
    and s.recipient=p_recipient for update of j;
  if v_job.id is null then return; end if;
  if v_job.provider_message_id is not null and v_job.provider_message_id<>p_message_id then return; end if;
  update public.repair_document_deliveries set provider_message_id=p_message_id,
    status=case when status='read' then 'read' when p_status='read' then 'read'
      when status='delivered' then 'delivered' when p_status='delivered' then 'delivered'
      when p_status='failed' or status='failed' then 'failed' else 'accepted' end,
    accepted_at=coalesce(accepted_at,p_timestamp),
    delivered_at=case when p_status in ('delivered','read') then coalesce(delivered_at,p_timestamp) else delivered_at end,
    read_at=case when p_status='read' then coalesce(read_at,p_timestamp) else read_at end,
    error_code=case when p_status='failed' and status not in ('delivered','read') then left(p_error,80)
      when status='failed' and p_status not in ('delivered','read') then error_code else null end,updated_at=now()
    where id=v_job.id;
end $$;
create function public.whatsapp_document_status(p_message_id text,p_job_id uuid,p_status text,p_recipient text,p_timestamp timestamptz,p_error text default null) returns void language sql set search_path='' as $$ select private.whatsapp_document_status(p_message_id,p_job_id,p_status,p_recipient,p_timestamp,p_error) $$;

create function private.whatsapp_document_optout(p_phone text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.whatsapp_service_assert();
  insert into private.whatsapp_recipient_optouts(phone) values(p_phone) on conflict(phone) do update set recorded_at=now();
  update public.repair_document_deliveries j set status='cancelled',error_code='customer_optout',updated_at=now()
    from private.repair_document_snapshots s where s.job_id=j.id and s.recipient=p_phone and j.status in ('pending','retry','processing');
end $$;
create function public.whatsapp_document_optout(p_phone text) returns void language sql set search_path='' as $$ select private.whatsapp_document_optout(p_phone) $$;

create function private.whatsapp_set_automation(p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.whatsapp_service_assert();
  if p_enabled and not exists(select 1 from private.whatsapp_automation_config where webhook_verified_at is not null) then
    raise exception 'Confirma primero el webhook de WhatsApp.' using errcode='23514';
  end if;
  update private.whatsapp_automation_config set enabled=p_enabled,
    activated_at=case when p_enabled and not enabled then now() else activated_at end;
  if not p_enabled then update public.repair_document_deliveries set status='cancelled',error_code='automation_paused',updated_at=now() where status in ('pending','retry','processing'); end if;
  return (select jsonb_build_object('enabled',enabled,'activatedAt',activated_at,'webhookVerified',webhook_verified_at is not null) from private.whatsapp_automation_config);
end $$;
create function public.whatsapp_set_automation(p_enabled boolean) returns jsonb language sql set search_path='' as $$ select private.whatsapp_set_automation(p_enabled) $$;

create function private.whatsapp_automation_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede consultar envios.' using errcode='42501'; end if;
  return (select jsonb_build_object('enabled',enabled,'activatedAt',activated_at,'webhookVerified',webhook_verified_at is not null) from private.whatsapp_automation_config);
end $$;
create function public.whatsapp_automation_status() returns jsonb language sql stable set search_path='' as $$ select private.whatsapp_automation_status() $$;

create function private.whatsapp_verify_webhook() returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.whatsapp_service_assert();
  update private.whatsapp_automation_config set webhook_verified_at=now();
end $$;
create function public.whatsapp_verify_webhook() returns void language sql set search_path='' as $$ select private.whatsapp_verify_webhook() $$;

create function private.whatsapp_recover_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_job public.repair_document_deliveries%rowtype; v_snapshot jsonb; v_phone text; v_consent boolean;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo mostrador puede reintentar documentos.' using errcode='42501'; end if;
  select * into strict v_job from public.repair_document_deliveries where id=p_id for update;
  if v_job.status not in ('blocked','failed') or v_job.submission_started_at is not null or v_job.provider_message_id is not null then
    raise exception 'Este envío ya fue presentado o está pendiente de confirmación. No se puede duplicar.' using errcode='23514';
  end if;
  if not exists(select 1 from private.whatsapp_automation_config where enabled) then raise exception 'Conectá y activá WhatsApp antes de reintentar.' using errcode='23514'; end if;
  v_snapshot:=private.whatsapp_document_snapshot(v_job.order_id);
  v_phone:=private.whatsapp_document_phone(v_snapshot#>>'{repair_access_customers,phone}');
  select whatsapp_document_consent and whatsapp_consent_phone=v_phone into v_consent from public.repair_access_orders where id=v_job.order_id;
  if v_phone='' or v_consent is not true or exists(select 1 from private.whatsapp_recipient_optouts where phone=v_phone) then
    raise exception 'Revisá el teléfono y registrá la autorización del cliente desde Editar ingreso.' using errcode='23514';
  end if;
  insert into private.repair_document_snapshot_history(job_id,payload,recipient,changed_by)
    select job_id,payload,recipient,auth.uid() from private.repair_document_snapshots where job_id=p_id;
  update private.repair_document_snapshots set payload=v_snapshot,recipient=v_phone,media_id=null where job_id=p_id;
  update public.repair_document_deliveries set status='pending',attempts=0,next_attempt_at=now(),recovered_at=now(),error_code=null,lease_token=null,lease_until=null,updated_at=now() where id=p_id;
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id) values('repair_access_orders',v_job.order_id::text,'update',
    jsonb_build_object('operation','whatsapp_document_recovery','document_id',p_id,'kind',v_job.kind),auth.uid());
  perform private.whatsapp_wake_worker();
end $$;
create function public.whatsapp_recover_document(p_id uuid) returns void language sql set search_path='' as $$ select private.whatsapp_recover_document(p_id) $$;

-- pg_net and Cron are available on hosted Supabase; the isolated Postgres harness omits them.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_net') then create extension if not exists pg_net with schema extensions; end if;
  if exists(select 1 from pg_available_extensions where name='pg_cron') and position('pg_cron' in current_setting('shared_preload_libraries'))>0 then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end $$;

create function private.whatsapp_configure_worker(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.whatsapp_service_assert();
  if length(p_token)<32 then raise exception 'Worker credential is too short'; end if;
  if to_regnamespace('vault') is null or to_regnamespace('net') is null or to_regnamespace('cron') is null then raise exception 'Falta habilitar el programador de envios.'; end if;
  execute 'select id from vault.secrets where name=$1' into v_id using 'chetech_whatsapp_worker_token';
  if v_id is null then execute 'select vault.create_secret($1,$2)' using p_token,'chetech_whatsapp_worker_token';
  else execute 'select vault.update_secret($1,$2)' using v_id,p_token; end if;
  execute 'select id from vault.secrets where name=$1' into v_id using 'chetech_whatsapp_worker_url';
  if v_id is null then execute 'select vault.create_secret($1,$2)' using 'https://chetech-admin.vercel.app/api/whatsapp/worker','chetech_whatsapp_worker_url';
  else execute 'select vault.update_secret($1,$2)' using v_id,'https://chetech-admin.vercel.app/api/whatsapp/worker'; end if;
  execute $cron$select cron.schedule('chetech-whatsapp-documents','* * * * *','select private.whatsapp_wake_worker()')$cron$;
end $$;
create function public.whatsapp_configure_worker(p_token text) returns void language sql set search_path='' as $$ select private.whatsapp_configure_worker(p_token) $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname like 'whatsapp_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',r.signature);
    execute format('grant execute on function %s to service_role',r.signature);
  end loop;
end $$;
grant usage on schema private to service_role;
grant execute on function private.whatsapp_document_phone(text),private.whatsapp_enqueue_document(uuid,text),private.whatsapp_automation_status(),public.whatsapp_automation_status() to authenticated;
grant execute on function private.whatsapp_recover_document(uuid),public.whatsapp_recover_document(uuid) to authenticated;

commit;
