-- Applied to production as migration version 20260727153208.
-- Treat a missing override flag as false when guarding manual order numbers.

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
  v_can_override boolean := coalesce(
    current_user in ('postgres', 'service_role')
    and v_override in ('history_import', 'rollback'),
    false
  );
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
