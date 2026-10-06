-- Applied to production as migration version 20260727152851.
-- Harden the reconciled repair numbering without changing any existing number.

create or replace function private.sync_repair_access_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_number integer;
  v_override text := current_setting(
    'chetech.repair_order_number_override',
    true
  );
  v_can_override boolean :=
    current_user in ('postgres', 'service_role')
    and v_override in ('history_import', 'rollback');
begin
  if tg_op = 'UPDATE' then
    if new.order_number is not distinct from old.order_number
       and new.repair_number is not distinct from old.repair_number then
      return new;
    end if;

    if not v_can_override then
      raise exception
        'El numero publico de una orden existente no se puede modificar.'
        using errcode = '42501';
    end if;

    if new.order_number is not null then
      v_number := new.order_number;
    elsif new.repair_number ~ '^REP-[0-9]{6}$' then
      v_number := substring(new.repair_number from '([0-9]+)$')::integer;
    else
      raise exception 'El numero publico de reparacion es invalido.'
        using errcode = '22023';
    end if;
  elsif new.order_number is not null or new.repair_number is not null then
    if not v_can_override or v_override <> 'history_import' then
      raise exception
        'El numero publico se genera automaticamente al crear la orden.'
        using errcode = '42501';
    end if;

    if new.order_number is not null then
      v_number := new.order_number;
    elsif new.repair_number ~ '^REP-[0-9]{6}$' then
      v_number := substring(new.repair_number from '([0-9]+)$')::integer;
    else
      raise exception 'El numero publico de reparacion es invalido.'
        using errcode = '22023';
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended('chetech.repair_access_order_number', 0)
    );
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

revoke all on function private.sync_repair_access_order_number()
  from public, anon, authenticated, service_role;

do $patch_intake$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'save_repair_access_intake'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_definition is null then
    raise exception 'No se encontro save_repair_access_intake(jsonb).';
  end if;

  v_patched := replace(
    v_definition,
    E'    v_repair_number := public.generate_repair_access_number();\n    v_action := ''insert'';',
    E'    v_action := ''insert'';'
  );
  v_patched := replace(
    v_patched,
    E'      repair_number,\n      customer_id,',
    E'      customer_id,'
  );
  v_patched := replace(
    v_patched,
    E'      v_repair_number,\n      v_customer_id,',
    E'      v_customer_id,'
  );
  v_patched := replace(
    v_patched,
    E'    returning id into v_order_id;',
    E'    returning id, repair_number into v_order_id, v_repair_number;'
  );

  if v_patched = v_definition
     or position('public.generate_repair_access_number()' in v_patched) > 0
     or position(E'      repair_number,\n      customer_id,' in v_patched) > 0
     or position(
       'returning id, repair_number into v_order_id, v_repair_number;'
       in v_patched
     ) = 0 then
    raise exception
      'No se pudo mover la generacion de numero al insert atomico.';
  end if;

  execute v_patched;
end
$patch_intake$;

revoke all on function public.generate_repair_access_number()
  from public, anon, authenticated, service_role;

comment on function public.generate_repair_access_number() is
  'Funcion heredada sin acceso API. Las altas generan el numero dentro del INSERT mediante trigger.';

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
    E'  if current_user <> ''service_role'' then\n    raise exception ''Esta importacion solo puede ejecutarse con service_role.''\n      using errcode = ''42501'';\n  end if;\n\n  if v_source is null',
    E'  if current_user <> ''service_role'' then\n    raise exception ''Esta importacion solo puede ejecutarse con service_role.''\n      using errcode = ''42501'';\n  end if;\n\n  perform set_config(\n    ''chetech.repair_order_number_override'',\n    ''history_import'',\n    true\n  );\n\n  if v_source is null'
  );
  v_patched := replace(
    v_patched,
    E'  if exists (\n    select 1\n    from jsonb_array_elements(coalesce(p_payload->''orders'', ''[]''::jsonb)) entry\n    join public.repair_access_orders existing_order\n      on existing_order.order_number = (entry->''row''->>''publicOrderNumber'')::integer\n  ) then\n    raise exception ''Un numero publico historico ya esta ocupado por otra orden.''\n      using errcode = ''23505'';\n  end if;',
    E'  if exists (\n    select 1\n    from jsonb_array_elements(coalesce(p_payload->''orders'', ''[]''::jsonb)) entry\n    join public.repair_access_orders existing_order\n      on existing_order.order_number = (entry->''row''->>''publicOrderNumber'')::integer\n    where not (\n      existing_order.import_row_key = entry->''row''->>''stableKey''\n      or (\n        existing_order.import_source = v_source\n        and existing_order.legacy_order_number = entry->''row''->>''legacyOrderNumber''\n      )\n    )\n  ) then\n    raise exception ''Un numero publico historico ya esta ocupado por otra orden.''\n      using errcode = ''23505'';\n  end if;'
  );

  if v_patched = v_definition
     or position('chetech.repair_order_number_override' in v_patched) = 0
     or position('existing_order.import_row_key' in v_patched) = 0
     or position('where not (' in v_patched) = 0 then
    raise exception
      'No se pudo endurecer de forma segura el importador historico.';
  end if;

  execute v_patched;
end
$patch_import$;

create or replace function public.rollback_repair_order_number_reconciliation(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.repair_order_number_reconciliation_runs%rowtype;
  v_current_total integer;
  v_backup_total integer;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chetech.repair_access_order_number', 0)
  );
  lock table public.repair_access_orders in access exclusive mode;
  lock table public.repairs in share row exclusive mode;

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

  select count(*) into v_current_total
  from public.repair_access_orders;

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

  if exists (
    select 1
    from public.repairs r
    join private.repair_order_number_reconciliation_backup orders_backup
      on orders_backup.run_id = p_run_id
     and orders_backup.order_id = r.repair_access_order_id
    left join private.repair_order_number_link_backup link_backup
      on link_backup.run_id = p_run_id
     and link_backup.entity_table = 'repairs'
     and link_backup.entity_id = r.id
    where link_backup.entity_id is null
       or r.order_number is distinct from link_backup.new_value
  ) or exists (
    select 1
    from private.repair_order_number_link_backup link_backup
    left join public.repairs r
      on r.id = link_backup.entity_id
     and r.repair_access_order_id in (
       select order_id
       from private.repair_order_number_reconciliation_backup
       where run_id = p_run_id
     )
    where link_backup.run_id = p_run_id
      and link_backup.entity_table = 'repairs'
      and r.id is null
  ) then
    raise exception
      'Reversa cancelada: cambiaron reparaciones vinculadas despues de la reconciliacion.';
  end if;

  perform set_config(
    'chetech.repair_order_number_override',
    'rollback',
    true
  );

  with temporary_numbers as (
    select
      order_id,
      900000 + row_number() over (order by order_id)::integer
        as temporary_number
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

  -- Sequence changes are not transactional, so this stays last.
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

comment on function public.rollback_repair_order_number_reconciliation(uuid) is
  'Rollback restringido que valida ordenes y enlaces antes de restaurar la numeracion.';
