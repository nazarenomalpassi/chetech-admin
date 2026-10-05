alter table public.repair_access_orders
  add column if not exists has_warranty boolean not null default false,
  add column if not exists warranty_requires_review boolean not null default false,
  add column if not exists historical_warranty_expired boolean,
  add column if not exists legacy_order_number text,
  add column if not exists import_source text,
  add column if not exists import_file_name text,
  add column if not exists import_row_key text,
  add column if not exists imported_at timestamptz;

update public.repair_access_orders
set has_warranty = true
where warranty_days > 0
   or warranty_start is not null
   or warranty_until is not null;

update public.repair_access_orders
set picked_up_at = (
  warranty_start::timestamp at time zone 'America/Argentina/Buenos_Aires'
)
where picked_up_at is null
  and warranty_start is not null
  and status = 'retirado';

update public.repair_access_orders
set
  warranty_start = (picked_up_at at time zone 'America/Argentina/Buenos_Aires')::date,
  warranty_until = (picked_up_at at time zone 'America/Argentina/Buenos_Aires')::date + warranty_days,
  warranty_requires_review = false,
  warranty_active = current_date between
    (picked_up_at at time zone 'America/Argentina/Buenos_Aires')::date
    and ((picked_up_at at time zone 'America/Argentina/Buenos_Aires')::date + warranty_days)
where has_warranty
  and warranty_days > 0
  and picked_up_at is not null;

update public.repair_access_orders
set
  warranty_start = null,
  warranty_until = null,
  warranty_active = false,
  warranty_requires_review = status = 'retirado' and picked_up_at is null
where not has_warranty;

update public.repair_access_orders
set
  warranty_start = null,
  warranty_until = null,
  warranty_active = false,
  warranty_requires_review = true
where status = 'retirado'
  and picked_up_at is null;

alter table public.repair_access_orders
  drop constraint if exists repair_access_orders_warranty_days_check;

alter table public.repair_access_orders
  add constraint repair_access_orders_warranty_days_check
    check (warranty_days >= 0);

alter table public.repair_access_orders
  drop constraint if exists repair_access_orders_warranty_assignment_check;

alter table public.repair_access_orders
  add constraint repair_access_orders_warranty_assignment_check
    check (not has_warranty or warranty_days > 0);

create unique index if not exists repair_access_orders_import_row_key_key
  on public.repair_access_orders (import_row_key)
  where import_row_key is not null and btrim(import_row_key) <> '';

create unique index if not exists repair_access_orders_import_legacy_key
  on public.repair_access_orders (import_source, legacy_order_number)
  where import_source is not null
    and legacy_order_number is not null
    and btrim(legacy_order_number) <> '';

create index if not exists repair_access_orders_warranty_lookup_idx
  on public.repair_access_orders (has_warranty, warranty_requires_review, warranty_until);

create index if not exists repair_access_orders_picked_up_at_idx
  on public.repair_access_orders (picked_up_at desc)
  where picked_up_at is not null;

drop index if exists public.repair_access_customers_phone_normalized_key;

create index if not exists repair_access_customers_phone_normalized_idx
  on public.repair_access_customers (phone_normalized)
  where phone_normalized is not null and btrim(phone_normalized) <> '';

alter table public.repair_access_import_batches
  add column if not exists status text not null default 'completed',
  add column if not exists completed_at timestamptz;

update public.repair_access_import_batches
set completed_at = coalesce(completed_at, created_at)
where status = 'completed';

alter table public.repair_access_import_batches
  drop constraint if exists repair_access_import_batches_status_check;

alter table public.repair_access_import_batches
  add constraint repair_access_import_batches_status_check
    check (status in ('running', 'completed', 'failed', 'rolled_back'));

alter table public.repair_access_import_rows
  add column if not exists stable_key text,
  add column if not exists order_id uuid references public.repair_access_orders(id) on delete set null,
  add column if not exists device_id uuid references public.repair_access_devices(id) on delete set null,
  add column if not exists customer_action text,
  add column if not exists review_reasons text[] not null default '{}'::text[];

alter table public.repair_access_import_rows
  drop constraint if exists repair_access_import_rows_status_check;

alter table public.repair_access_import_rows
  add constraint repair_access_import_rows_status_check
    check (
      status in (
        'imported',
        'updated',
        'duplicate_ignored',
        'error',
        'imported_order',
        'ambiguous_created',
        'skipped_existing'
      )
    );

create unique index if not exists repair_access_import_rows_batch_stable_key
  on public.repair_access_import_rows (batch_id, stable_key)
  where stable_key is not null and btrim(stable_key) <> '';

create index if not exists repair_access_import_rows_order_id_idx
  on public.repair_access_import_rows (order_id)
  where order_id is not null;

create index if not exists repair_access_import_rows_device_id_idx
  on public.repair_access_import_rows (device_id)
  where device_id is not null;

insert into public.app_settings (key, value)
values ('repair_warranty', jsonb_build_object('defaultDays', 90))
on conflict (key) do nothing;

create or replace function private.sync_repair_access_warranty_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pickup_date date;
begin
  if new.status = 'retirado' and new.picked_up_at is null then
    new.warranty_requires_review := true;
    new.warranty_start := null;
    new.warranty_until := null;
    new.warranty_active := false;
    return new;
  end if;

  if not new.has_warranty then
    new.warranty_start := null;
    new.warranty_until := null;
    new.warranty_active := false;
    new.warranty_requires_review := false;
    return new;
  end if;

  if new.warranty_days <= 0 then
    raise exception 'La duracion de la garantia debe ser mayor a cero.'
      using errcode = '23514';
  end if;

  if new.picked_up_at is null then
    new.warranty_start := null;
    new.warranty_until := null;
    new.warranty_active := false;
    new.warranty_requires_review := false;
    return new;
  end if;

  v_pickup_date := (
    new.picked_up_at at time zone 'America/Argentina/Buenos_Aires'
  )::date;
  new.warranty_start := v_pickup_date;
  new.warranty_until := v_pickup_date + new.warranty_days;
  new.warranty_active := current_date between v_pickup_date and (v_pickup_date + new.warranty_days);
  new.warranty_requires_review := false;
  return new;
end;
$$;

drop trigger if exists sync_repair_access_warranty_fields on public.repair_access_orders;
create trigger sync_repair_access_warranty_fields
before insert or update of
  status,
  picked_up_at,
  has_warranty,
  warranty_days,
  warranty_start,
  warranty_until,
  warranty_requires_review
on public.repair_access_orders
for each row execute function private.sync_repair_access_warranty_fields();

create or replace function public.import_repair_history_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_customer_entry jsonb;
  v_order_entry jsonb;
  v_skipped_entry jsonb;
  v_customer_data jsonb;
  v_row_data jsonb;
  v_order_data jsonb;
  v_device_data jsonb;
  v_existing_customer_id uuid;
  v_customer_id uuid;
  v_device_id uuid;
  v_order_id uuid;
  v_existing_order_id uuid;
  v_customer_created boolean;
  v_review_reasons text[];
  v_source text := nullif(p_payload->>'source', '');
  v_file_name text := nullif(p_payload->>'fileName', '');
  v_expected_rows integer := coalesce((p_payload->>'expectedRows')::integer, 0);
  v_customers_created integer := 0;
  v_customers_linked integer := 0;
  v_orders_inserted integer := 0;
  v_orders_skipped integer := 0;
  v_row_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Esta importacion solo puede ejecutarse con service_role.'
      using errcode = '42501';
  end if;

  if v_source is null or v_file_name is null then
    raise exception 'Faltan el origen o el nombre del archivo.'
      using errcode = '22023';
  end if;

  v_row_count :=
    jsonb_array_length(coalesce(p_payload->'orders', '[]'::jsonb))
    + jsonb_array_length(coalesce(p_payload->'skippedOrders', '[]'::jsonb));

  if v_expected_rows <= 0 or v_row_count <> v_expected_rows then
    raise exception 'El lote no contiene la cantidad de filas esperada: % de %.',
      v_row_count,
      v_expected_rows
      using errcode = '22023';
  end if;

  create temporary table if not exists repair_history_customer_map (
    customer_key text primary key,
    customer_id uuid not null,
    customer_created boolean not null
  ) on commit drop;
  truncate table repair_history_customer_map;

  insert into public.repair_access_import_batches (
    source,
    file_name,
    total_rows,
    summary,
    status
  )
  values (
    v_source,
    v_file_name,
    v_expected_rows,
    jsonb_build_object(
      'sheet', p_payload->>'sheetName',
      'dry_run', coalesce(p_payload->'dryRunSummary', '{}'::jsonb)
    ),
    'running'
  )
  returning id into v_batch_id;

  for v_customer_entry in
    select value
    from jsonb_array_elements(coalesce(p_payload->'customers', '[]'::jsonb))
  loop
    v_customer_data := coalesce(v_customer_entry->'data', '{}'::jsonb);
    v_existing_customer_id := nullif(v_customer_entry->>'existingId', '')::uuid;
    v_customer_created := false;

    if v_existing_customer_id is not null then
      select id
      into v_customer_id
      from public.repair_access_customers
      where id = v_existing_customer_id
      for update;

      if not found then
        raise exception 'No se encontro el cliente existente %.', v_existing_customer_id
          using errcode = 'P0002';
      end if;

      update public.repair_access_customers
      set
        phone = case
          when nullif(btrim(coalesce(phone, '')), '') is null
            then nullif(v_customer_data->>'phone', '')
          else phone
        end,
        phone_normalized = case
          when nullif(btrim(coalesce(phone_normalized, '')), '') is null
            then nullif(v_customer_data->>'phoneNormalized', '')
          else phone_normalized
        end,
        alternate_phone = case
          when nullif(btrim(coalesce(alternate_phone, '')), '') is null
            then nullif(v_customer_data->>'alternatePhone', '')
          else alternate_phone
        end,
        alternate_phone_normalized = case
          when nullif(btrim(coalesce(alternate_phone_normalized, '')), '') is null
            then nullif(v_customer_data->>'alternatePhoneNormalized', '')
          else alternate_phone_normalized
        end,
        dni = case
          when nullif(btrim(coalesce(dni, '')), '') is null
            then nullif(v_customer_data->>'dni', '')
          else dni
        end,
        email = case
          when nullif(btrim(coalesce(email, '')), '') is null
            then nullif(v_customer_data->>'email', '')
          else email
        end,
        address = case
          when nullif(btrim(coalesce(address, '')), '') is null
            then nullif(v_customer_data->>'address', '')
          else address
        end,
        notes = case
          when nullif(v_customer_data->>'notes', '') is null then notes
          when nullif(btrim(coalesce(notes, '')), '') is null then v_customer_data->>'notes'
          when position(v_customer_data->>'notes' in notes) > 0 then notes
          else notes || ' | ' || (v_customer_data->>'notes')
        end,
        last_imported_at = now(),
        updated_at = now()
      where id = v_customer_id;

      v_customers_linked := v_customers_linked + 1;
    else
      insert into public.repair_access_customers (
        full_name,
        full_name_normalized,
        phone,
        phone_normalized,
        alternate_phone,
        alternate_phone_normalized,
        dni,
        email,
        address,
        notes,
        source,
        last_imported_at
      )
      values (
        coalesce(nullif(v_customer_data->>'fullName', ''), 'Cliente historico sin identificar'),
        coalesce(
          nullif(v_customer_data->>'fullNameNormalized', ''),
          lower(coalesce(nullif(v_customer_data->>'fullName', ''), 'cliente historico sin identificar'))
        ),
        nullif(v_customer_data->>'phone', ''),
        nullif(v_customer_data->>'phoneNormalized', ''),
        nullif(v_customer_data->>'alternatePhone', ''),
        nullif(v_customer_data->>'alternatePhoneNormalized', ''),
        nullif(v_customer_data->>'dni', ''),
        nullif(v_customer_data->>'email', ''),
        nullif(v_customer_data->>'address', ''),
        nullif(v_customer_data->>'notes', ''),
        v_source,
        now()
      )
      returning id into v_customer_id;

      v_customer_created := true;
      v_customers_created := v_customers_created + 1;
    end if;

    insert into repair_history_customer_map (
      customer_key,
      customer_id,
      customer_created
    )
    values (
      v_customer_entry->>'key',
      v_customer_id,
      v_customer_created
    );
  end loop;

  for v_order_entry in
    select value
    from jsonb_array_elements(coalesce(p_payload->'orders', '[]'::jsonb))
  loop
    v_row_data := v_order_entry->'row';
    v_order_data := v_row_data->'order';
    v_device_data := v_row_data->'device';

    select customer_id, customer_created
    into v_customer_id, v_customer_created
    from repair_history_customer_map
    where customer_key = v_order_entry->>'customerKey';

    if not found then
      raise exception 'No se encontro el cliente planificado para la fila %.',
        v_row_data->>'rowNumber'
        using errcode = 'P0002';
    end if;

    select id
    into v_existing_order_id
    from public.repair_access_orders
    where import_row_key = v_row_data->>'stableKey'
       or (
         import_source = v_source
         and legacy_order_number = v_row_data->>'legacyOrderNumber'
       )
    limit 1
    for update;

    if found then
      v_orders_skipped := v_orders_skipped + 1;
      insert into public.repair_access_import_rows (
        batch_id,
        row_number,
        raw_data,
        normalized_phone,
        customer_id,
        order_id,
        stable_key,
        status,
        customer_action,
        message
      )
      values (
        v_batch_id,
        (v_row_data->>'rowNumber')::integer,
        coalesce(v_order_entry->'rawData', '{}'::jsonb),
        nullif(v_row_data->'customer'->>'phoneNormalized', ''),
        v_customer_id,
        v_existing_order_id,
        v_row_data->>'stableKey',
        'skipped_existing',
        'linked_existing',
        'La orden ya habia sido importada.'
      );
      continue;
    end if;

    insert into public.repair_access_devices (
      customer_id,
      device_type,
      brand,
      model,
      serial_number,
      accessory_details,
      visual_condition,
      notes,
      created_at,
      updated_at
    )
    values (
      v_customer_id,
      coalesce(nullif(v_device_data->>'deviceType', ''), 'Equipo sin especificar'),
      nullif(v_device_data->>'brand', ''),
      nullif(v_device_data->>'model', ''),
      nullif(v_device_data->>'serialNumber', ''),
      nullif(v_device_data->>'accessoryDetails', ''),
      nullif(v_device_data->>'visualCondition', ''),
      nullif(v_device_data->>'notes', ''),
      (v_order_data->>'intakeDate')::date::timestamp at time zone 'America/Argentina/Buenos_Aires',
      now()
    )
    returning id into v_device_id;

    insert into public.repair_access_orders (
      repair_number,
      customer_id,
      device_id,
      intake_date,
      issue_reported,
      budget_amount,
      final_amount,
      is_paid,
      delivered_at,
      picked_up_at,
      work_performed,
      internal_observations,
      technician_name,
      budget_detail,
      budgeted_at,
      finished_at,
      notes,
      status,
      has_warranty,
      warranty_days,
      warranty_start,
      warranty_until,
      warranty_conditions,
      warranty_requires_review,
      warranty_active,
      historical_warranty_expired,
      legacy_order_number,
      import_source,
      import_file_name,
      import_row_key,
      imported_at,
      created_at,
      updated_at
    )
    values (
      public.generate_repair_access_number(),
      v_customer_id,
      v_device_id,
      (v_order_data->>'intakeDate')::date,
      coalesce(nullif(v_order_data->>'issueReported', ''), 'Falla historica sin detalle'),
      nullif(v_order_data->>'budgetAmount', '')::numeric,
      nullif(v_order_data->>'finalAmount', '')::numeric,
      false,
      case
        when nullif(v_order_data->>'deliveredAt', '') is null then null
        else (v_order_data->>'deliveredAt')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
      end,
      case
        when nullif(v_order_data->>'pickedUpAt', '') is null then null
        else (v_order_data->>'pickedUpAt')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
      end,
      nullif(v_order_data->>'workPerformed', ''),
      nullif(v_order_data->>'internalObservations', ''),
      nullif(v_order_data->>'technicianName', ''),
      nullif(v_order_data->>'budgetDetail', ''),
      case
        when nullif(v_order_data->>'budgetedAt', '') is null then null
        else (v_order_data->>'budgetedAt')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
      end,
      case
        when nullif(v_order_data->>'finishedAt', '') is null then null
        else (v_order_data->>'finishedAt')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
      end,
      nullif(v_order_data->>'notes', ''),
      v_order_data->>'status',
      coalesce((v_order_data->>'hasWarranty')::boolean, false),
      coalesce((v_order_data->>'warrantyDays')::integer, 0),
      nullif(v_order_data->>'warrantyStart', '')::date,
      nullif(v_order_data->>'warrantyUntil', '')::date,
      nullif(v_order_data->>'warrantyConditions', ''),
      coalesce((v_order_data->>'warrantyRequiresReview')::boolean, false),
      false,
      nullif(v_order_data->>'historicalWarrantyExpired', '')::boolean,
      v_row_data->>'legacyOrderNumber',
      v_source,
      v_file_name,
      v_row_data->>'stableKey',
      now(),
      (v_order_data->>'intakeDate')::date::timestamp at time zone 'America/Argentina/Buenos_Aires',
      now()
    )
    returning id into v_order_id;

    insert into public.repair_access_status_history (
      repair_order_id,
      previous_status,
      next_status,
      notes,
      changed_at
    )
    values (
      v_order_id,
      null,
      v_order_data->>'status',
      'Estado reconstruido durante la importacion historica.',
      coalesce(
        case
          when nullif(v_order_data->>'pickedUpAt', '') is null then null
          else (v_order_data->>'pickedUpAt')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
        end,
        case
          when nullif(v_order_data->>'finishedAt', '') is null then null
          else (v_order_data->>'finishedAt')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
        end,
        (v_order_data->>'intakeDate')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'
      )
    );

    select coalesce(array_agg(value), '{}'::text[])
    into v_review_reasons
    from jsonb_array_elements_text(coalesce(v_row_data->'reviewReasons', '[]'::jsonb));

    insert into public.repair_access_import_rows (
      batch_id,
      row_number,
      raw_data,
      normalized_phone,
      customer_id,
      device_id,
      order_id,
      stable_key,
      status,
      customer_action,
      review_reasons,
      message
    )
    values (
      v_batch_id,
      (v_row_data->>'rowNumber')::integer,
      coalesce(v_order_entry->'rawData', '{}'::jsonb),
      nullif(v_row_data->'customer'->>'phoneNormalized', ''),
      v_customer_id,
      v_device_id,
      v_order_id,
      v_row_data->>'stableKey',
      case
        when v_order_entry->>'matchReason' in (
          'shared_phone_incompatible_identity',
          'multiple_identity_matches'
        ) then 'ambiguous_created'
        else 'imported_order'
      end,
      case
        when v_customer_created then 'created'
        else 'linked_existing'
      end,
      v_review_reasons,
      case
        when cardinality(v_review_reasons) > 0
          then 'Importada con datos para revision.'
        else 'Orden historica importada.'
      end
    );

    v_orders_inserted := v_orders_inserted + 1;
  end loop;

  for v_skipped_entry in
    select value
    from jsonb_array_elements(coalesce(p_payload->'skippedOrders', '[]'::jsonb))
  loop
    select o.id, o.customer_id, o.device_id
    into v_existing_order_id, v_customer_id, v_device_id
    from public.repair_access_orders o
    where o.id = (v_skipped_entry->>'existingOrderId')::uuid
      and (
        o.import_row_key = v_skipped_entry->>'stableKey'
        or (
          o.import_source = v_source
          and o.legacy_order_number = v_skipped_entry->>'legacyOrderNumber'
        )
      )
    limit 1;

    if not found then
      raise exception 'No se encontro la orden previamente importada %.',
        v_skipped_entry->>'legacyOrderNumber'
        using errcode = 'P0002';
    end if;

    insert into public.repair_access_import_rows (
      batch_id,
      row_number,
      raw_data,
      customer_id,
      device_id,
      order_id,
      stable_key,
      status,
      customer_action,
      message
    )
    values (
      v_batch_id,
      (v_skipped_entry->>'rowNumber')::integer,
      coalesce(v_skipped_entry->'rawData', '{}'::jsonb),
      v_customer_id,
      v_device_id,
      v_existing_order_id,
      v_skipped_entry->>'stableKey',
      'skipped_existing',
      'linked_existing',
      'La segunda ejecucion omitio la orden ya importada.'
    );

    v_orders_skipped := v_orders_skipped + 1;
  end loop;

  update public.repair_access_import_batches
  set
    imported_count = v_orders_inserted,
    updated_count = v_customers_linked,
    duplicate_count = v_orders_skipped,
    error_count = 0,
    summary = summary || jsonb_build_object(
      'customers_created', v_customers_created,
      'customers_linked', v_customers_linked,
      'orders_inserted', v_orders_inserted,
      'orders_skipped', v_orders_skipped
    ),
    status = 'completed',
    completed_at = now()
  where id = v_batch_id;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    changes,
    user_id
  )
  values (
    'repair_access_import_batches',
    v_batch_id::text,
    'insert',
    jsonb_build_object(
      'source', v_source,
      'file_name', v_file_name,
      'customers_created', v_customers_created,
      'customers_linked', v_customers_linked,
      'orders_inserted', v_orders_inserted,
      'orders_skipped', v_orders_skipped
    ),
    null
  );

  return jsonb_build_object(
    'batchId', v_batch_id,
    'customersCreated', v_customers_created,
    'customersLinked', v_customers_linked,
    'ordersInserted', v_orders_inserted,
    'ordersSkipped', v_orders_skipped
  );
end;
$$;

create or replace function public.rollback_repair_history_import(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_order_ids uuid[];
  v_device_ids uuid[];
  v_created_customer_ids uuid[];
  v_deleted_orders integer := 0;
  v_deleted_devices integer := 0;
  v_deleted_customers integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception 'La reversa solo puede ejecutarse con service_role.'
      using errcode = '42501';
  end if;

  select status
  into v_status
  from public.repair_access_import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'No se encontro el lote indicado.' using errcode = 'P0002';
  end if;

  if v_status <> 'completed' then
    raise exception 'Solo se puede revertir un lote completado.'
      using errcode = '23514';
  end if;

  select
    coalesce(array_agg(distinct order_id) filter (where order_id is not null), '{}'::uuid[]),
    coalesce(array_agg(distinct device_id) filter (where device_id is not null), '{}'::uuid[]),
    coalesce(
      array_agg(distinct customer_id) filter (
        where customer_id is not null and customer_action = 'created'
      ),
      '{}'::uuid[]
    )
  into v_order_ids, v_device_ids, v_created_customer_ids
  from public.repair_access_import_rows
  where batch_id = p_batch_id
    and status in ('imported_order', 'ambiguous_created');

  if exists (
    select 1
    from public.repair_access_payments
    where repair_order_id = any(v_order_ids)
  ) then
    raise exception 'El lote tiene ordenes con pagos posteriores y no puede revertirse automaticamente.'
      using errcode = '23514';
  end if;

  delete from public.repair_access_orders
  where id = any(v_order_ids);
  get diagnostics v_deleted_orders = row_count;

  delete from public.repair_access_devices d
  where d.id = any(v_device_ids)
    and not exists (
      select 1 from public.repair_access_orders o where o.device_id = d.id
    );
  get diagnostics v_deleted_devices = row_count;

  delete from public.repair_access_customers c
  where c.id = any(v_created_customer_ids)
    and not exists (
      select 1 from public.repair_access_orders o where o.customer_id = c.id
    )
    and not exists (
      select 1 from public.repair_access_devices d where d.customer_id = c.id
    );
  get diagnostics v_deleted_customers = row_count;

  update public.repair_access_import_batches
  set
    status = 'rolled_back',
    summary = summary || jsonb_build_object(
      'rolled_back_at', now(),
      'deleted_orders', v_deleted_orders,
      'deleted_devices', v_deleted_devices,
      'deleted_customers', v_deleted_customers
    )
  where id = p_batch_id;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    changes,
    user_id
  )
  values (
    'repair_access_import_batches',
    p_batch_id::text,
    'delete',
    jsonb_build_object(
      'deleted_orders', v_deleted_orders,
      'deleted_devices', v_deleted_devices,
      'deleted_customers', v_deleted_customers
    ),
    null
  );

  return jsonb_build_object(
    'batchId', p_batch_id,
    'deletedOrders', v_deleted_orders,
    'deletedDevices', v_deleted_devices,
    'deletedCustomers', v_deleted_customers
  );
end;
$$;

revoke all on function public.import_repair_history_transaction(jsonb)
  from public, anon, authenticated;
revoke all on function public.rollback_repair_history_import(uuid)
  from public, anon, authenticated;
grant execute on function public.import_repair_history_transaction(jsonb)
  to service_role;
grant execute on function public.rollback_repair_history_import(uuid)
  to service_role;

grant select, insert, update, delete
  on public.repair_access_import_batches,
     public.repair_access_import_rows
  to service_role;

comment on column public.repair_access_orders.picked_up_at is
  'Retiro efectivo del equipo. Es la unica fecha que inicia la garantia.';
comment on column public.repair_access_orders.warranty_active is
  'Compatibilidad historica. La vigencia visual debe recalcularse contra la fecha actual.';
comment on column public.repair_access_orders.import_row_key is
  'Clave estable e idempotente de la fila historica importada.';
comment on function public.import_repair_history_transaction(jsonb) is
  'Importa clientes, equipos y ordenes historicas en una unica transaccion. Solo service_role.';
