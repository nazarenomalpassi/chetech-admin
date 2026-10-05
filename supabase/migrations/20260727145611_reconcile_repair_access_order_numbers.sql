-- Applied to production as migration version 20260727145611.
create schema if not exists private;

create table if not exists private.repair_order_number_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  status text not null check (status in ('preparing', 'applied', 'rolled_back')),
  total_orders integer not null,
  historical_orders integer not null,
  current_system_orders integer not null,
  post_import_orders integer not null,
  changed_orders integer not null,
  preserved_orders integer not null,
  closed_legacy_gap integer,
  sequence_before bigint not null,
  sequence_after bigint,
  details jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

create table if not exists private.repair_order_number_reconciliation_backup (
  run_id uuid not null references private.repair_order_number_reconciliation_runs(id) on delete restrict,
  order_id uuid not null,
  old_repair_number text not null,
  old_order_number integer not null,
  new_order_number integer not null,
  origin text not null,
  reason text not null,
  customer_id uuid not null,
  device_id uuid not null,
  intake_date date not null,
  created_at timestamptz not null,
  captured_at timestamptz not null default now(),
  primary key (run_id, order_id),
  unique (run_id, new_order_number)
);

create table if not exists private.repair_order_number_link_backup (
  run_id uuid not null references private.repair_order_number_reconciliation_runs(id) on delete restrict,
  entity_table text not null,
  entity_id uuid not null,
  old_value text,
  new_value text,
  primary key (run_id, entity_table, entity_id)
);

alter table private.repair_order_number_reconciliation_runs enable row level security;
alter table private.repair_order_number_reconciliation_backup enable row level security;
alter table private.repair_order_number_link_backup enable row level security;

revoke all on private.repair_order_number_reconciliation_runs from public, anon, authenticated;
revoke all on private.repair_order_number_reconciliation_backup from public, anon, authenticated;
revoke all on private.repair_order_number_link_backup from public, anon, authenticated;

alter table public.repair_access_orders
  add column if not exists order_number integer,
  add column if not exists numbering_source text,
  add column if not exists numbering_reconciled_at timestamptz,
  add column if not exists numbering_reconciliation_id uuid;

do $reconcile$
declare
  v_run_id uuid := gen_random_uuid();
  v_total integer;
  v_historical integer;
  v_current integer;
  v_post integer;
  v_changed integer;
  v_preserved integer;
  v_legacy_min integer;
  v_legacy_max integer;
  v_legacy_missing integer[];
  v_closed_gap integer;
  v_sequence_before bigint;
  v_target_duplicates integer;
  v_unclassified integer;
  v_invalid_numbers integer;
  v_target_max integer;
  v_target_missing integer[];
begin
  perform pg_advisory_xact_lock(hashtextextended('chetech.repair_access_order_number', 0));
  lock table public.repair_access_orders in access exclusive mode;

  select last_value into v_sequence_before
  from public.repair_access_order_number_seq;

  select count(*) into v_invalid_numbers
  from public.repair_access_orders
  where repair_number is null
     or repair_number !~ '^REP-[0-9]{6}$'
     or substring(repair_number from '([0-9]+)$')::integer <= 0;

  if v_invalid_numbers <> 0 then
    raise exception 'Reconciliacion cancelada: hay % numeros publicos invalidos.', v_invalid_numbers;
  end if;

  update public.repair_access_orders
  set
    order_number = substring(repair_number from '([0-9]+)$')::integer,
    numbering_source = case
      when import_source = 'service_export_excel' then 'legacy_import'
      else 'current_system'
    end
  where order_number is null
     or numbering_source is null;

  select
    count(*),
    min(nullif(regexp_replace(legacy_order_number, '[^0-9]', '', 'g'), '')::integer),
    max(nullif(regexp_replace(legacy_order_number, '[^0-9]', '', 'g'), '')::integer)
  into v_historical, v_legacy_min, v_legacy_max
  from public.repair_access_orders
  where import_source = 'service_export_excel'
    and import_file_name = 'Service Exporado.xlsx';

  select coalesce(array_agg(candidate order by candidate), '{}'::integer[])
  into v_legacy_missing
  from generate_series(1, v_legacy_max) candidate
  where not exists (
    select 1
    from public.repair_access_orders o
    where o.import_source = 'service_export_excel'
      and o.import_file_name = 'Service Exporado.xlsx'
      and nullif(regexp_replace(o.legacy_order_number, '[^0-9]', '', 'g'), '')::integer = candidate
  );

  if v_historical <> 261
     or v_legacy_min <> 1
     or v_legacy_max <> 266
     or v_legacy_missing <> array[2, 4, 152, 158, 199]::integer[] then
    raise exception
      'Reconciliacion cancelada: el lote historico no coincide (cantidad %, minimo %, maximo %, faltantes %).',
      v_historical, v_legacy_min, v_legacy_max, v_legacy_missing;
  end if;

  -- Closing the latest proven legacy gap preserves source order while changing
  -- the smallest possible suffix and maps legacy 266 to public order 265.
  select max(candidate) into v_closed_gap
  from unnest(v_legacy_missing) candidate;

  create temp table repair_order_number_plan (
    order_id uuid primary key,
    current_number integer not null,
    new_number integer not null,
    origin text not null,
    reason text not null
  ) on commit drop;

  insert into repair_order_number_plan (
    order_id,
    current_number,
    new_number,
    origin,
    reason
  )
  select
    o.id,
    o.order_number,
    nullif(regexp_replace(o.legacy_order_number, '[^0-9]', '', 'g'), '')::integer
      - case
          when nullif(regexp_replace(o.legacy_order_number, '[^0-9]', '', 'g'), '')::integer > v_closed_gap
            then 1
          else 0
        end,
    'legacy_import',
    case
      when nullif(regexp_replace(o.legacy_order_number, '[^0-9]', '', 'g'), '')::integer > v_closed_gap
        then 'legacy_shift_after_missing_199'
      else 'legacy_original_number'
    end
  from public.repair_access_orders o
  where o.import_source = 'service_export_excel'
    and o.import_file_name = 'Service Exporado.xlsx';

  insert into repair_order_number_plan (
    order_id,
    current_number,
    new_number,
    origin,
    reason
  )
  select
    o.id,
    o.order_number,
    o.order_number,
    'current_system',
    'current_system_preserved'
  from public.repair_access_orders o
  where o.import_source is null
    and o.order_number between 266 and 385;

  with post_import as (
    select
      o.id,
      o.order_number,
      row_number() over (order by o.created_at, o.id)::integer as chronological_position
    from public.repair_access_orders o
    where o.import_source is null
      and o.order_number > 385
  )
  insert into repair_order_number_plan (
    order_id,
    current_number,
    new_number,
    origin,
    reason
  )
  select
    p.id,
    p.order_number,
    385 + p.chronological_position,
    'post_import',
    'post_import_chronological'
  from post_import p;

  select count(*) into v_total from public.repair_access_orders;
  select count(*) into v_current
  from repair_order_number_plan
  where origin = 'current_system';
  select count(*) into v_post
  from repair_order_number_plan
  where origin = 'post_import';
  select count(*) into v_unclassified
  from public.repair_access_orders o
  where not exists (
    select 1 from repair_order_number_plan p where p.order_id = o.id
  );
  select count(*) into v_target_duplicates
  from (
    select new_number
    from repair_order_number_plan
    group by new_number
    having count(*) > 1
  ) duplicated;

  if v_total <> (select count(*) from repair_order_number_plan)
     or v_unclassified <> 0
     or v_current <> 120
     or v_target_duplicates <> 0 then
    raise exception
      'Reconciliacion cancelada: total %, plan %, sin clasificar %, actuales %, duplicados destino %.',
      v_total,
      (select count(*) from repair_order_number_plan),
      v_unclassified,
      v_current,
      v_target_duplicates;
  end if;

  if exists (
    select 1
    from generate_series(266, 385) expected
    left join repair_order_number_plan p
      on p.new_number = expected
     and p.origin = 'current_system'
    where p.order_id is null
  ) then
    raise exception 'Reconciliacion cancelada: el rango original 266-385 no esta completo.';
  end if;

  if not exists (
    select 1
    from repair_order_number_plan p
    join public.repair_access_orders o on o.id = p.order_id
    where p.current_number = 646
      and p.new_number = 265
      and o.legacy_order_number = '266'
  ) then
    raise exception 'Reconciliacion cancelada: no se verifico el ancla 646 -> 265.';
  end if;

  if exists (
    select 1
    from (values (647, 386), (648, 387), (649, 388)) expected(current_number, new_number)
    left join repair_order_number_plan p
      on p.current_number = expected.current_number
     and p.new_number = expected.new_number
    where p.order_id is null
  ) then
    raise exception 'Reconciliacion cancelada: no se verificaron las anclas 647-649 -> 386-388.';
  end if;

  select
    count(*) filter (where current_number <> new_number),
    count(*) filter (where current_number = new_number),
    max(new_number)
  into v_changed, v_preserved, v_target_max
  from repair_order_number_plan;

  select coalesce(array_agg(candidate order by candidate), '{}'::integer[])
  into v_target_missing
  from generate_series(1, v_target_max) candidate
  where not exists (
    select 1 from repair_order_number_plan p where p.new_number = candidate
  );

  if v_target_missing <> array[2, 4, 152, 158]::integer[] then
    raise exception
      'Reconciliacion cancelada: los huecos finales no son los esperados (%).',
      v_target_missing;
  end if;

  insert into private.repair_order_number_reconciliation_runs (
    id,
    source_file,
    status,
    total_orders,
    historical_orders,
    current_system_orders,
    post_import_orders,
    changed_orders,
    preserved_orders,
    closed_legacy_gap,
    sequence_before,
    details
  )
  values (
    v_run_id,
    'Service Exporado.xlsx',
    'preparing',
    v_total,
    v_historical,
    v_current,
    v_post,
    v_changed,
    v_preserved,
    v_closed_gap,
    v_sequence_before,
    jsonb_build_object(
      'legacy_missing_before', v_legacy_missing,
      'public_missing_after', v_target_missing,
      'expected_next_number', v_target_max + 1
    )
  );

  insert into private.repair_order_number_reconciliation_backup (
    run_id,
    order_id,
    old_repair_number,
    old_order_number,
    new_order_number,
    origin,
    reason,
    customer_id,
    device_id,
    intake_date,
    created_at
  )
  select
    v_run_id,
    o.id,
    o.repair_number,
    o.order_number,
    p.new_number,
    p.origin,
    p.reason,
    o.customer_id,
    o.device_id,
    o.intake_date,
    o.created_at
  from public.repair_access_orders o
  join repair_order_number_plan p on p.order_id = o.id;

  insert into private.repair_order_number_link_backup (
    run_id,
    entity_table,
    entity_id,
    old_value,
    new_value
  )
  select
    v_run_id,
    'repairs',
    r.id,
    r.order_number,
    'REP-' || lpad(p.new_number::text, 6, '0')
  from public.repairs r
  join repair_order_number_plan p on p.order_id = r.repair_access_order_id;

  with temporary_numbers as (
    select
      order_id,
      900000 + row_number() over (order by order_id)::integer as temporary_number
    from repair_order_number_plan
  )
  update public.repair_access_orders o
  set
    order_number = t.temporary_number,
    repair_number = 'TMP-' || replace(o.id::text, '-', '')
  from temporary_numbers t
  where o.id = t.order_id;

  update public.repair_access_orders o
  set
    order_number = p.new_number,
    repair_number = 'REP-' || lpad(p.new_number::text, 6, '0'),
    numbering_source = p.origin,
    numbering_reconciled_at = now(),
    numbering_reconciliation_id = v_run_id
  from repair_order_number_plan p
  where o.id = p.order_id;

  update public.repairs r
  set order_number = o.repair_number
  from public.repair_access_orders o
  where r.repair_access_order_id = o.id
    and r.order_number is distinct from o.repair_number;

  update private.repair_order_number_reconciliation_runs
  set
    sequence_after = v_target_max,
    details = details || jsonb_build_object(
      'prepared_at', now(),
      'next_number', v_target_max + 1
    )
  where id = v_run_id;
end
$reconcile$;

alter table public.repair_access_orders
  alter column order_number set not null,
  alter column numbering_source set default 'current_system',
  alter column numbering_source set not null,
  alter column repair_number set not null;

alter table public.repair_access_orders
  drop constraint if exists repair_access_orders_order_number_positive_check,
  add constraint repair_access_orders_order_number_positive_check
    check (order_number between 1 and 999999),
  drop constraint if exists repair_access_orders_numbering_source_check,
  add constraint repair_access_orders_numbering_source_check
    check (numbering_source in ('legacy_import', 'current_system', 'post_import')),
  drop constraint if exists repair_access_orders_repair_number_format_check,
  add constraint repair_access_orders_repair_number_format_check
    check (repair_number = 'REP-' || lpad(order_number::text, 6, '0'));

create unique index if not exists repair_access_orders_order_number_key
  on public.repair_access_orders (order_number);

alter sequence public.repair_access_order_number_seq maxvalue 999999;

create or replace function private.sync_repair_access_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_number integer;
begin
  if tg_op = 'UPDATE' and new.order_number is not distinct from old.order_number then
    v_number := old.order_number;
  elsif new.order_number is not null then
    v_number := new.order_number;
  elsif new.repair_number ~ '^REP-[0-9]{6}$' then
    v_number := substring(new.repair_number from '([0-9]+)$')::integer;
  else
    perform pg_advisory_xact_lock(hashtextextended('chetech.repair_access_order_number', 0));
    v_number := nextval('public.repair_access_order_number_seq');
  end if;

  if v_number < 1 or v_number > 999999 then
    raise exception 'El numero publico de reparacion esta fuera de rango.'
      using errcode = '22003';
  end if;

  new.order_number := v_number;
  new.repair_number := 'REP-' || lpad(v_number::text, 6, '0');
  new.numbering_source := case
    when new.import_source is not null then 'legacy_import'
    else coalesce(nullif(new.numbering_source, ''), 'current_system')
  end;
  return new;
end;
$$;

drop trigger if exists sync_repair_access_order_number
  on public.repair_access_orders;

create trigger sync_repair_access_order_number
before insert or update of order_number, repair_number
on public.repair_access_orders
for each row
execute function private.sync_repair_access_order_number();

create or replace function public.generate_repair_access_number()
returns text
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_number integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('chetech.repair_access_order_number', 0));
  v_number := nextval('public.repair_access_order_number_seq');
  return 'REP-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.generate_repair_access_number() from public, anon;
grant execute on function public.generate_repair_access_number() to authenticated, service_role;

do $patch_import$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'import_repair_history_transaction'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_definition is null then
    raise exception 'No se encontro import_repair_history_transaction(jsonb).';
  end if;

  v_patched := replace(
    v_definition,
    E'begin\n  if current_user <> ''service_role'' then',
    E'begin\n  perform pg_advisory_xact_lock(hashtextextended(''chetech.repair_access_order_number'', 0));\n\n  if current_user <> ''service_role'' then'
  );
  v_patched := replace(
    v_patched,
    E'  create temporary table if not exists repair_history_customer_map (',
    E'  if exists (\n    select 1\n    from jsonb_array_elements(coalesce(p_payload->''orders'', ''[]''::jsonb)) entry\n    where case\n      when coalesce(entry->''row''->>''publicOrderNumber'', '''') ~ ''^[0-9]+$''\n        then (entry->''row''->>''publicOrderNumber'')::integer not between 1 and 265\n      else true\n    end\n  ) then\n    raise exception ''El lote contiene un numero publico historico invalido.''\n      using errcode = ''22023'';\n  end if;\n\n  if exists (\n    select public_order_number\n    from (\n      select (entry->''row''->>''publicOrderNumber'')::integer as public_order_number\n      from jsonb_array_elements(coalesce(p_payload->''orders'', ''[]''::jsonb)) entry\n    ) planned_numbers\n    group by public_order_number\n    having count(*) > 1\n  ) then\n    raise exception ''El lote contiene numeros publicos historicos repetidos.''\n      using errcode = ''23505'';\n  end if;\n\n  if exists (\n    select 1\n    from jsonb_array_elements(coalesce(p_payload->''orders'', ''[]''::jsonb)) entry\n    join public.repair_access_orders existing_order\n      on existing_order.order_number = (entry->''row''->>''publicOrderNumber'')::integer\n  ) then\n    raise exception ''Un numero publico historico ya esta ocupado por otra orden.''\n      using errcode = ''23505'';\n  end if;\n\n  create temporary table if not exists repair_history_customer_map ('
  );
  v_patched := replace(
    v_patched,
    E'      repair_number,\n      customer_id,',
    E'      order_number,\n      customer_id,'
  );
  v_patched := replace(
    v_patched,
    E'      public.generate_repair_access_number(),\n      v_customer_id,',
    E'      (v_row_data->>''publicOrderNumber'')::integer,\n      v_customer_id,'
  );
  v_patched := replace(
    v_patched,
    E'  return jsonb_build_object(\n    ''batchId'', v_batch_id,',
    E'  perform setval(\n    ''public.repair_access_order_number_seq'',\n    (select max(order_number) from public.repair_access_orders),\n    true\n  );\n\n  return jsonb_build_object(\n    ''batchId'', v_batch_id,'
  );

  if v_patched = v_definition
     or position('public.generate_repair_access_number()' in v_patched) > 0
     or position(E'      order_number,\n      customer_id,' in v_patched) = 0
     or position('publicOrderNumber' in v_patched) = 0
     or position('numeros publicos historicos repetidos' in v_patched) = 0
     or position('repair_access_order_number_seq' in v_patched) = 0 then
    raise exception 'No se pudo actualizar de forma segura el importador historico.';
  end if;

  execute v_patched;
end
$patch_import$;

create or replace function public.rollback_repair_order_number_reconciliation(
  p_run_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_run private.repair_order_number_reconciliation_runs%rowtype;
  v_current_total integer;
  v_backup_total integer;
  v_result jsonb;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'La reversa solo puede ejecutarse con service_role.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chetech.repair_access_order_number', 0));
  lock table public.repair_access_orders in access exclusive mode;

  select * into v_run
  from private.repair_order_number_reconciliation_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'No se encontro la reconciliacion solicitada.'
      using errcode = 'P0002';
  end if;
  if v_run.status <> 'applied' then
    raise exception 'La reconciliacion no esta en estado applied.';
  end if;

  select count(*) into v_current_total from public.repair_access_orders;
  select count(*) into v_backup_total
  from private.repair_order_number_reconciliation_backup
  where run_id = p_run_id;

  if v_current_total <> v_backup_total
     or exists (
       select 1
       from public.repair_access_orders o
       where not exists (
         select 1
         from private.repair_order_number_reconciliation_backup b
         where b.run_id = p_run_id
           and b.order_id = o.id
       )
     ) then
    raise exception
      'Reversa cancelada: se crearon o eliminaron ordenes despues de la reconciliacion.';
  end if;

  with temporary_numbers as (
    select
      order_id,
      900000 + row_number() over (order by order_id)::integer as temporary_number
    from private.repair_order_number_reconciliation_backup
    where run_id = p_run_id
  )
  update public.repair_access_orders o
  set order_number = t.temporary_number
  from temporary_numbers t
  where o.id = t.order_id;

  update public.repair_access_orders o
  set
    order_number = b.old_order_number,
    repair_number = b.old_repair_number,
    numbering_source = case
      when o.import_source is not null then 'legacy_import'
      else 'current_system'
    end,
    numbering_reconciled_at = null,
    numbering_reconciliation_id = null
  from private.repair_order_number_reconciliation_backup b
  where b.run_id = p_run_id
    and b.order_id = o.id;

  update public.repairs r
  set order_number = b.old_value
  from private.repair_order_number_link_backup b
  where b.run_id = p_run_id
    and b.entity_table = 'repairs'
    and b.entity_id = r.id;

  update private.repair_order_number_reconciliation_runs
  set
    status = 'rolled_back',
    rolled_back_at = now(),
    details = details || jsonb_build_object('rolled_back_at', now())
  where id = p_run_id;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    changes,
    user_id
  )
  values (
    'repair_order_number_reconciliation',
    p_run_id::text,
    'update',
    jsonb_build_object(
      'status', 'rolled_back',
      'restored_orders', v_backup_total,
      'restored_sequence', v_run.sequence_before
    ),
    null
  );

  v_result := jsonb_build_object(
    'runId', p_run_id,
    'restoredOrders', v_backup_total,
    'restoredSequence', v_run.sequence_before
  );

  -- Sequence changes are not transactional, so this must remain the final
  -- database operation after every reversible validation and write succeeded.
  perform setval(
    'public.repair_access_order_number_seq',
    v_run.sequence_before,
    true
  );

  return v_result;
end;
$$;

revoke all on function public.rollback_repair_order_number_reconciliation(uuid)
  from public, anon, authenticated;
grant execute on function public.rollback_repair_order_number_reconciliation(uuid)
  to service_role;

comment on column public.repair_access_orders.order_number is
  'Numero publico entero e inmutable por identidad; repair_number es su representacion REP-000000.';
comment on column public.repair_access_orders.legacy_order_number is
  'Numero original informado por la fuente historica. No se sobreescribe durante reconciliaciones.';
comment on function public.rollback_repair_order_number_reconciliation(uuid) is
  'Restaura la numeracion previa solo si no se agregaron ni eliminaron ordenes desde la reconciliacion.';

do $finalize_reconciliation$
declare
  v_run private.repair_order_number_reconciliation_runs%rowtype;
  v_distinct_reconciliation_ids integer;
  v_current_total integer;
  v_current_max integer;
  v_invalid_rows integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('chetech.repair_access_order_number', 0));
  lock table public.repair_access_orders in access exclusive mode;

  select count(distinct numbering_reconciliation_id)
  into v_distinct_reconciliation_ids
  from public.repair_access_orders;

  if v_distinct_reconciliation_ids <> 1 then
    raise exception
      'Reconciliacion cancelada al finalizar: se esperaban datos asociados a una unica ejecucion.';
  end if;

  select r.* into v_run
  from private.repair_order_number_reconciliation_runs r
  where r.id = (
    select numbering_reconciliation_id
    from public.repair_access_orders
    where numbering_reconciliation_id is not null
    limit 1
  )
  for update;

  if not found or v_run.status <> 'preparing' then
    raise exception
      'Reconciliacion cancelada al finalizar: la ejecucion no esta en estado preparing.';
  end if;

  select count(*), max(order_number)
  into v_current_total, v_current_max
  from public.repair_access_orders;

  select count(*)
  into v_invalid_rows
  from public.repair_access_orders o
  left join private.repair_order_number_reconciliation_backup b
    on b.run_id = v_run.id
   and b.order_id = o.id
  where b.order_id is null
     or o.order_number <> b.new_order_number
     or o.repair_number <> 'REP-' || lpad(o.order_number::text, 6, '0')
     or o.numbering_reconciliation_id is distinct from v_run.id;

  if v_current_total <> v_run.total_orders
     or v_current_max <> v_run.sequence_after
     or v_invalid_rows <> 0 then
    raise exception
      'Reconciliacion cancelada al finalizar: total %, maximo %, invalidas %.',
      v_current_total,
      v_current_max,
      v_invalid_rows;
  end if;

  if exists (
    select 1
    from public.repair_access_orders
    group by order_number
    having count(*) > 1
  ) then
    raise exception
      'Reconciliacion cancelada al finalizar: existen numeros publicos duplicados.';
  end if;

  update private.repair_order_number_reconciliation_runs
  set
    status = 'applied',
    details = details || jsonb_build_object(
      'applied_at', now(),
      'next_number', sequence_after + 1
    )
  where id = v_run.id;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    changes,
    user_id
  )
  values (
    'repair_order_number_reconciliation',
    v_run.id::text,
    'update',
    jsonb_build_object(
      'total_orders', v_run.total_orders,
      'historical_orders', v_run.historical_orders,
      'current_system_orders', v_run.current_system_orders,
      'post_import_orders', v_run.post_import_orders,
      'changed_orders', v_run.changed_orders,
      'preserved_orders', v_run.preserved_orders,
      'closed_legacy_gap', v_run.closed_legacy_gap,
      'sequence_before', v_run.sequence_before,
      'sequence_after', v_run.sequence_after
    ),
    null
  );

  -- setval() is intentionally the final operation in the migration because
  -- PostgreSQL sequences are not rolled back with surrounding table changes.
  perform setval(
    'public.repair_access_order_number_seq',
    v_run.sequence_after,
    true
  );
end
$finalize_reconciliation$;
