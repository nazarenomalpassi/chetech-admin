create or replace function private.sync_repair_access_warranty_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pickup_date date;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if tg_op = 'UPDATE'
    and new.status = 'retirado'
    and old.status is distinct from 'retirado'
    and new.picked_up_at is null
  then
    new.picked_up_at := now();
  end if;

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
  new.warranty_active := v_today between v_pickup_date and (v_pickup_date + new.warranty_days);
  new.warranty_requires_review := false;
  return new;
end;
$$;

create or replace function public.save_repair_access_technical(
  p_order_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_status text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select status
    into v_previous_status
  from public.repair_access_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontro la orden seleccionada.' using errcode = 'P0002';
  end if;

  update public.repair_access_orders
  set
    technician_name = nullif(p_payload->>'technician_name', ''),
    technical_diagnosis = nullif(p_payload->>'technical_diagnosis', ''),
    repair_progress = nullif(p_payload->>'repair_progress', ''),
    internal_observations = nullif(p_payload->>'internal_observations', ''),
    used_parts = nullif(p_payload->>'used_parts', ''),
    work_performed = nullif(p_payload->>'work_performed', ''),
    budget_amount = coalesce((p_payload->>'budget_amount')::numeric, 0),
    budget_detail = nullif(p_payload->>'budget_detail', ''),
    budget_response_notes = nullif(p_payload->>'budget_response_notes', ''),
    budget_response_at = nullif(p_payload->>'budget_response_at', '')::timestamptz,
    budgeted_at = nullif(p_payload->>'budgeted_at', '')::timestamptz,
    final_amount = coalesce((p_payload->>'final_amount')::numeric, 0),
    payment_method = nullif(p_payload->>'payment_method', ''),
    payment_notes = nullif(p_payload->>'payment_notes', ''),
    is_paid = coalesce((p_payload->>'is_paid')::boolean, false),
    paid_at = nullif(p_payload->>'paid_at', '')::timestamptz,
    finished_at = nullif(p_payload->>'finished_at', '')::timestamptz,
    picked_up_at = nullif(p_payload->>'picked_up_at', '')::timestamptz,
    has_warranty = coalesce((p_payload->>'has_warranty')::boolean, false),
    warranty_days = coalesce((p_payload->>'warranty_days')::integer, 0),
    warranty_conditions = nullif(p_payload->>'warranty_conditions', ''),
    status = p_payload->>'status',
    updated_by = v_user_id,
    updated_at = now()
  where id = p_order_id;

  if v_previous_status is distinct from p_payload->>'status' then
    insert into public.repair_access_status_history (
      repair_order_id,
      previous_status,
      next_status,
      changed_by,
      notes
    )
    values (
      p_order_id,
      v_previous_status,
      p_payload->>'status',
      v_user_id,
      coalesce(
        nullif(p_payload->>'budget_response_notes', ''),
        nullif(p_payload->>'internal_observations', '')
      )
    );
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values ('repair_access_orders', p_order_id::text, 'update', p_payload, v_user_id);

  return jsonb_build_object('id', p_order_id);
end;
$$;

revoke all on function public.save_repair_access_technical(uuid, jsonb) from public, anon;
grant execute on function public.save_repair_access_technical(uuid, jsonb)
  to authenticated, service_role;

create or replace function public.get_technician_repair_orders(p_order_id uuid default null)
returns table(payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_access_operations()) then
    raise exception 'No tenes permiso para consultar las ordenes.' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', o.id,
    'repair_number', o.repair_number,
    'legacy_order_number', o.legacy_order_number,
    'intake_date', o.intake_date,
    'issue_reported', o.issue_reported,
    'technical_diagnosis', o.technical_diagnosis,
    'repair_progress', o.repair_progress,
    'budget_amount', o.budget_amount,
    'budget_detail', o.budget_detail,
    'budget_response_notes', null,
    'budget_response_at', null,
    'approved_amount', null,
    'final_amount', o.final_amount,
    'payment_method', null,
    'payment_notes', null,
    'is_paid', o.is_paid,
    'paid_at', null,
    'delivered_at', o.delivered_at,
    'picked_up_at', o.picked_up_at,
    'has_warranty', o.has_warranty,
    'warranty_requires_review', o.warranty_requires_review,
    'warranty_start', o.warranty_start,
    'warranty_until', o.warranty_until,
    'warranty_days', o.warranty_days,
    'warranty_conditions', o.warranty_conditions,
    'warranty_active', o.warranty_active,
    'historical_warranty_expired', o.historical_warranty_expired,
    'work_performed', o.work_performed,
    'used_parts', o.used_parts,
    'internal_observations', o.internal_observations,
    'technician_name', o.technician_name,
    'technician_id', o.technician_id,
    'notes', null,
    'priority', o.priority,
    'status', o.status,
    'created_at', o.created_at,
    'repair_access_customers', case when c.id is null then null else jsonb_build_object(
      'id', c.id,
      'full_name', c.full_name,
      'phone', c.phone,
      'alternate_phone', c.alternate_phone,
      'phone_normalized', c.phone_normalized,
      'dni', null,
      'email', null,
      'address', c.address,
      'notes', null
    ) end,
    'repair_access_devices', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'device_type', d.device_type,
      'brand', d.brand,
      'model', d.model,
      'serial_number', d.serial_number,
      'accessory_details', d.accessory_details,
      'visual_condition', d.visual_condition,
      'notes', d.notes
    ) end
  )
  from public.repair_access_orders o
  left join public.repair_access_customers c on c.id = o.customer_id
  left join public.repair_access_devices d on d.id = o.device_id
  where p_order_id is null or o.id = p_order_id
  order by o.created_at desc
  limit case when p_order_id is null then 500 else 1 end;
end;
$$;

revoke all on function public.get_technician_repair_orders(uuid) from public, anon;
grant execute on function public.get_technician_repair_orders(uuid) to authenticated;

comment on function private.sync_repair_access_warranty_fields() is
  'Starts repair warranty from the effective pickup date and derives its stored dates.';
comment on function public.get_technician_repair_orders(uuid) is
  'Returns the technician-safe repair projection, including read-only warranty status fields.';
