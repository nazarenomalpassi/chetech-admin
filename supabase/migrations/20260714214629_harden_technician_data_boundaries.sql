create or replace function public.get_product_category_counts()
returns table(id uuid, name text, sku_prefix text, product_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_access_operations()) then
    raise exception 'No tenes permiso para consultar el catalogo.' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.name,
    c.sku_prefix,
    count(p.id)::bigint
  from public.categories c
  left join public.products p on p.category_id = c.id
  group by c.id, c.name, c.sku_prefix
  order by c.name;
end;
$$;

create or replace function public.get_technician_product_catalog(
  p_search text default null,
  p_category uuid default null,
  p_status text default 'all'
)
returns table(
  id uuid,
  sku text,
  name text,
  sale_price numeric,
  stock integer,
  min_stock integer,
  is_active boolean,
  notes text,
  category_id uuid,
  category_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_access_operations()) then
    raise exception 'No tenes permiso para consultar el catalogo.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.sku,
    p.name,
    p.sale_price,
    p.stock,
    p.min_stock,
    p.is_active,
    p.notes,
    p.category_id,
    c.name
  from public.products p
  left join public.categories c on c.id = p.category_id
  where
    (p_category is null or p.category_id = p_category)
    and (
      p_status = 'all'
      or (p_status = 'active' and p.is_active)
      or (p_status = 'inactive' and not p.is_active)
    )
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or p.name ilike '%' || trim(p_search) || '%'
      or coalesce(p.sku, '') ilike '%' || trim(p_search) || '%'
    )
  order by p.name;
end;
$$;

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
    'warranty_start', null,
    'warranty_until', null,
    'warranty_days', 0,
    'warranty_conditions', null,
    'warranty_active', false,
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
  limit case when p_order_id is null then 100 else 1 end;
end;
$$;

create or replace function public.update_technician_repair_workshop(
  p_order_id uuid,
  p_status text,
  p_repair_amount numeric,
  p_budget_detail text,
  p_repair_progress text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.repair_access_orders%rowtype;
  v_now timestamptz := now();
  v_amount numeric;
begin
  if v_user_id is null or not (select private.is_technician()) then
    raise exception 'No tenes permiso para actualizar esta orden.' using errcode = '42501';
  end if;

  if p_status not in (
    'pendiente_revision', 'en_revision', 'presupuestado', 'presupuestado_aceptado',
    'presupuestado_rechazado', 'listo_para_retirar', 'retirado', 'sin_solucion'
  ) then
    raise exception 'El estado seleccionado no es valido.' using errcode = '23514';
  end if;

  if coalesce(p_repair_amount, 0) < 0 then
    raise exception 'El monto de la reparacion no puede ser negativo.' using errcode = '23514';
  end if;

  select * into v_order
  from public.repair_access_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontro la orden seleccionada.' using errcode = 'P0002';
  end if;

  v_amount := case
    when v_order.is_paid then coalesce(v_order.final_amount, v_order.budget_amount, 0)
    else coalesce(p_repair_amount, 0)
  end;

  update public.repair_access_orders
  set
    status = p_status,
    budget_amount = v_amount,
    final_amount = v_amount,
    budget_detail = nullif(trim(coalesce(p_budget_detail, '')), ''),
    repair_progress = nullif(trim(coalesce(p_repair_progress, '')), ''),
    budgeted_at = case when v_amount > 0 then coalesce(v_order.budgeted_at, v_now) else null end,
    budget_response_at = case
      when p_status in ('presupuestado_aceptado', 'presupuestado_rechazado') then coalesce(v_order.budget_response_at, v_now)
      else v_order.budget_response_at
    end,
    finished_at = case when p_status in ('listo_para_retirar', 'retirado') then coalesce(v_order.finished_at, v_now) else null end,
    updated_by = v_user_id,
    updated_at = v_now
  where id = p_order_id;

  if v_order.status is distinct from p_status then
    insert into public.repair_access_status_history (
      repair_order_id, previous_status, next_status, changed_by, notes
    ) values (
      p_order_id,
      v_order.status,
      p_status,
      v_user_id,
      coalesce(nullif(trim(coalesce(p_repair_progress, '')), ''), nullif(trim(coalesce(p_budget_detail, '')), ''))
    );
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'repair_access_orders',
    p_order_id::text,
    'update',
    jsonb_build_object(
      'status', p_status,
      'budget_amount', v_amount,
      'final_amount', v_amount,
      'budget_detail', nullif(trim(coalesce(p_budget_detail, '')), ''),
      'repair_progress', nullif(trim(coalesce(p_repair_progress, '')), '')
    ),
    v_user_id
  );

  return jsonb_build_object('id', p_order_id);
end;
$$;

create or replace function public.update_technician_repair_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.repair_access_orders%rowtype;
  v_finished_at timestamptz;
begin
  if v_user_id is null or not (select private.is_technician()) then
    raise exception 'No tenes permiso para actualizar esta orden.' using errcode = '42501';
  end if;

  if p_status not in (
    'pendiente_revision', 'en_revision', 'presupuestado', 'presupuestado_aceptado',
    'presupuestado_rechazado', 'listo_para_retirar', 'retirado', 'sin_solucion'
  ) then
    raise exception 'El estado seleccionado no es valido.' using errcode = '23514';
  end if;

  select * into v_order
  from public.repair_access_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontro la orden seleccionada.' using errcode = 'P0002';
  end if;

  v_finished_at := case
    when p_status in ('listo_para_retirar', 'retirado') then coalesce(v_order.finished_at, now())
    else null
  end;

  update public.repair_access_orders
  set status = p_status,
      finished_at = v_finished_at,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_order_id;

  if v_order.status is distinct from p_status then
    insert into public.repair_access_status_history (
      repair_order_id, previous_status, next_status, changed_by, notes
    ) values (
      p_order_id, v_order.status, p_status, v_user_id, 'Cambio rapido desde la lista de ordenes.'
    );
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'repair_access_orders',
    p_order_id::text,
    'update',
    jsonb_build_object('status', p_status, 'finished_at', v_finished_at),
    v_user_id
  );

  return jsonb_build_object('id', p_order_id);
end;
$$;

create or replace function private.enforce_technician_repair_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_columns text[] := array[
    'status',
    'technical_diagnosis',
    'repair_progress',
    'internal_observations',
    'used_parts',
    'work_performed',
    'budget_amount',
    'budget_detail',
    'final_amount',
    'budgeted_at',
    'budget_response_at',
    'finished_at',
    'technician_name',
    'technician_id',
    'updated_by',
    'updated_at'
  ];
begin
  if (select private.is_technician()) then
    if (to_jsonb(new) - allowed_columns) is distinct from (to_jsonb(old) - allowed_columns) then
      raise exception 'El rol tecnico no puede modificar datos administrativos de la orden.'
        using errcode = '42501';
    end if;

    if old.is_paid and (
      new.budget_amount is distinct from old.budget_amount
      or new.final_amount is distinct from old.final_amount
    ) then
      raise exception 'El monto queda protegido porque la orden ya fue cobrada.'
        using errcode = '42501';
    end if;

    if new.updated_by is distinct from (select auth.uid()) then
      raise exception 'La actualizacion tecnica debe identificar al usuario actual.'
        using errcode = '42501';
    end if;

    if new.technician_id is distinct from old.technician_id
      and new.technician_id is distinct from (select auth.uid()) then
      raise exception 'Un tecnico solo puede asignarse una orden a si mismo.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists products_operational_read on public.products;
create policy products_admin_select
  on public.products for select to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_customers_operational_read on public.repair_access_customers;
create policy repair_access_customers_admin_select
  on public.repair_access_customers for select to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_devices_operational_read on public.repair_access_devices;
create policy repair_access_devices_admin_select
  on public.repair_access_devices for select to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_orders_operational_read on public.repair_access_orders;
drop policy if exists repair_access_orders_update_by_role on public.repair_access_orders;
create policy repair_access_orders_admin_select
  on public.repair_access_orders for select to authenticated
  using ((select private.is_admin()));
create policy repair_access_orders_admin_update
  on public.repair_access_orders for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists repair_access_status_history_operational_read on public.repair_access_status_history;
drop policy if exists repair_access_status_history_insert_by_role on public.repair_access_status_history;
create policy repair_access_status_history_admin_select
  on public.repair_access_status_history for select to authenticated
  using ((select private.is_admin()));
create policy repair_access_status_history_admin_insert
  on public.repair_access_status_history for insert to authenticated
  with check ((select private.is_admin()));

revoke all on function public.get_product_category_counts() from public, anon;
revoke all on function public.get_technician_product_catalog(text, uuid, text) from public, anon;
revoke all on function public.get_technician_repair_orders(uuid) from public, anon;
revoke all on function public.update_technician_repair_workshop(uuid, text, numeric, text, text) from public, anon;
revoke all on function public.update_technician_repair_status(uuid, text) from public, anon;

grant execute on function public.get_product_category_counts() to authenticated;
grant execute on function public.get_technician_product_catalog(text, uuid, text) to authenticated;
grant execute on function public.get_technician_repair_orders(uuid) to authenticated;
grant execute on function public.update_technician_repair_workshop(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.update_technician_repair_status(uuid, text) to authenticated;
