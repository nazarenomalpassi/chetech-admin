-- Performance and consistency primitives for daily Chetech operations.
-- Functions remain SECURITY INVOKER so existing RLS policies continue to apply.

create index if not exists repair_access_orders_created_at_idx
  on public.repair_access_orders (created_at desc);

create index if not exists repair_access_customers_created_at_idx
  on public.repair_access_customers (created_at desc);

create sequence if not exists public.sale_number_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1;

do $$
declare
  max_number bigint;
  current_number bigint;
  current_is_called boolean;
begin
  select coalesce(max(substring(sale_number from '(\d+)$')::bigint), 0)
    into max_number
  from public.sales
  where sale_number ~ '\d+$';

  select last_value, is_called
    into current_number, current_is_called
  from public.sale_number_seq;

  if max_number > current_number
     or (max_number = current_number and max_number > 0 and not current_is_called) then
    perform setval('public.sale_number_seq', max_number, true);
  end if;
end $$;

grant usage, select on sequence public.sale_number_seq to authenticated, service_role;

create or replace function public.generate_sale_number()
returns text
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  select 'V-' || lpad(nextval('public.sale_number_seq')::text, 4, '0');
$$;

revoke all on function public.generate_sale_number() from public, anon;
grant execute on function public.generate_sale_number() to authenticated, service_role;

create or replace function public.get_product_category_counts()
returns table (
  id uuid,
  name text,
  sku_prefix text,
  product_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.name,
    c.sku_prefix,
    count(p.id)::bigint as product_count
  from public.categories c
  left join public.products p on p.category_id = c.id
  group by c.id, c.name, c.sku_prefix
  order by c.name;
$$;

revoke all on function public.get_product_category_counts() from public, anon;
grant execute on function public.get_product_category_counts() to authenticated, service_role;

create or replace function public.get_dashboard_cash_summary(
  p_cutoff timestamptz,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  medio_pago text,
  total_income numeric,
  total_outcome numeric,
  period_sales numeric,
  period_repairs numeric,
  period_expenses numeric,
  period_invoices numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    m.medio_pago,
    coalesce(sum(m.monto) filter (where m.tipo in ('venta', 'reparacion', 'facturacion')), 0)::numeric as total_income,
    coalesce(sum(m.monto) filter (where m.tipo in ('gasto', 'sueldo')), 0)::numeric as total_outcome,
    coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.fecha >= p_start and m.fecha < p_end), 0)::numeric as period_sales,
    coalesce(sum(m.monto) filter (where m.tipo = 'reparacion' and m.fecha >= p_start and m.fecha < p_end), 0)::numeric as period_repairs,
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto' and m.fecha >= p_start and m.fecha < p_end), 0)::numeric as period_expenses,
    coalesce(sum(m.monto) filter (where m.tipo = 'facturacion' and m.fecha >= p_start and m.fecha < p_end), 0)::numeric as period_invoices
  from public.movimientos_caja m
  where m.fecha >= coalesce(
    p_cutoff,
    nullif((select value->>'movementCutoff' from public.app_settings where key = 'cash_runtime'), '')::timestamptz,
    '2026-04-16T14:21:01.222Z'::timestamptz
  )
  group by m.medio_pago;
$$;

revoke all on function public.get_dashboard_cash_summary(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_dashboard_cash_summary(timestamptz, timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.save_repair_access_intake(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_customer_id uuid := nullif(p_payload->>'customer_id', '')::uuid;
  v_device_id uuid := nullif(p_payload->>'device_id', '')::uuid;
  v_previous_status text;
  v_repair_number text;
  v_action text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  if v_customer_id is null then
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
      created_by,
      updated_at
    )
    values (
      p_payload->>'customer_name',
      p_payload->>'customer_name_normalized',
      nullif(p_payload->>'customer_phone', ''),
      nullif(p_payload->>'customer_phone_normalized', ''),
      nullif(p_payload->>'customer_alternate_phone', ''),
      nullif(p_payload->>'customer_alternate_phone_normalized', ''),
      nullif(p_payload->>'customer_dni', ''),
      nullif(p_payload->>'customer_email', ''),
      nullif(p_payload->>'customer_address', ''),
      nullif(p_payload->>'customer_notes', ''),
      'manual',
      v_user_id,
      now()
    )
    returning id into v_customer_id;
  else
    update public.repair_access_customers
    set
      full_name = p_payload->>'customer_name',
      full_name_normalized = p_payload->>'customer_name_normalized',
      phone = nullif(p_payload->>'customer_phone', ''),
      phone_normalized = nullif(p_payload->>'customer_phone_normalized', ''),
      alternate_phone = nullif(p_payload->>'customer_alternate_phone', ''),
      alternate_phone_normalized = nullif(p_payload->>'customer_alternate_phone_normalized', ''),
      dni = nullif(p_payload->>'customer_dni', ''),
      email = nullif(p_payload->>'customer_email', ''),
      address = nullif(p_payload->>'customer_address', ''),
      notes = nullif(p_payload->>'customer_notes', ''),
      updated_at = now()
    where id = v_customer_id;

    if not found then
      raise exception 'No se encontro el cliente seleccionado.' using errcode = 'P0002';
    end if;
  end if;

  if v_device_id is null then
    insert into public.repair_access_devices (
      customer_id,
      device_type,
      brand,
      model,
      serial_number,
      accessory_details,
      visual_condition,
      created_by,
      updated_by,
      updated_at
    )
    values (
      v_customer_id,
      p_payload->>'device_type',
      nullif(p_payload->>'device_brand', ''),
      nullif(p_payload->>'device_model', ''),
      nullif(p_payload->>'serial_number', ''),
      nullif(p_payload->>'accessory_details', ''),
      nullif(p_payload->>'visual_condition', ''),
      v_user_id,
      v_user_id,
      now()
    )
    returning id into v_device_id;
  else
    update public.repair_access_devices
    set
      customer_id = v_customer_id,
      device_type = p_payload->>'device_type',
      brand = nullif(p_payload->>'device_brand', ''),
      model = nullif(p_payload->>'device_model', ''),
      serial_number = nullif(p_payload->>'serial_number', ''),
      accessory_details = nullif(p_payload->>'accessory_details', ''),
      visual_condition = nullif(p_payload->>'visual_condition', ''),
      updated_by = v_user_id,
      updated_at = now()
    where id = v_device_id;

    if not found then
      raise exception 'No se encontro el equipo seleccionado.' using errcode = 'P0002';
    end if;
  end if;

  if v_order_id is null then
    v_repair_number := public.generate_repair_access_number();
    v_action := 'insert';

    insert into public.repair_access_orders (
      repair_number,
      customer_id,
      device_id,
      intake_date,
      issue_reported,
      notes,
      priority,
      status,
      created_by,
      updated_by,
      updated_at
    )
    values (
      v_repair_number,
      v_customer_id,
      v_device_id,
      (p_payload->>'intake_date')::date,
      p_payload->>'issue_reported',
      nullif(p_payload->>'notes', ''),
      nullif(p_payload->>'priority', ''),
      p_payload->>'status',
      v_user_id,
      v_user_id,
      now()
    )
    returning id into v_order_id;
  else
    select status, repair_number
      into v_previous_status, v_repair_number
    from public.repair_access_orders
    where id = v_order_id
    for update;

    if not found then
      raise exception 'No se encontro la orden seleccionada.' using errcode = 'P0002';
    end if;

    v_action := 'update';

    update public.repair_access_orders
    set
      customer_id = v_customer_id,
      device_id = v_device_id,
      intake_date = (p_payload->>'intake_date')::date,
      issue_reported = p_payload->>'issue_reported',
      notes = nullif(p_payload->>'notes', ''),
      priority = nullif(p_payload->>'priority', ''),
      status = p_payload->>'status',
      updated_by = v_user_id,
      updated_at = now()
    where id = v_order_id;
  end if;

  if v_previous_status is distinct from p_payload->>'status' then
    insert into public.repair_access_status_history (
      repair_order_id,
      previous_status,
      next_status,
      changed_by,
      notes
    )
    values (
      v_order_id,
      v_previous_status,
      p_payload->>'status',
      v_user_id,
      nullif(p_payload->>'notes', '')
    );
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'repair_access_orders',
    v_order_id::text,
    v_action,
    jsonb_build_object(
      'repair_number', v_repair_number,
      'customer_id', v_customer_id,
      'device_id', v_device_id,
      'intake_date', p_payload->>'intake_date',
      'status', p_payload->>'status'
    ),
    v_user_id
  );

  return jsonb_build_object(
    'id', v_order_id,
    'repair_number', v_repair_number,
    'action', v_action
  );
end;
$$;

revoke all on function public.save_repair_access_intake(jsonb) from public, anon;
grant execute on function public.save_repair_access_intake(jsonb) to authenticated, service_role;

create or replace function public.save_sale_atomic(
  p_sale_id uuid,
  p_sold_at timestamptz,
  p_items jsonb,
  p_payments jsonb,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_sale_id uuid := p_sale_id;
  v_sale_number text;
  v_subtotal numeric(12,2);
  v_cost_total numeric(12,2);
  v_profit_total numeric(12,2);
  v_payment_total numeric(12,2);
  v_missing_products integer;
  v_insufficient_product text;
  v_action text;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Agrega al menos un medio de pago.' using errcode = '22023';
  end if;

  if v_sale_id is not null then
    select role into v_role from public.profiles where id = v_user_id;
    if coalesce(v_role, 'empleado') <> 'admin' then
      raise exception 'Solo un administrador puede editar ventas existentes.' using errcode = '42501';
    end if;

    perform 1 from public.sales where id = v_sale_id for update;
    if not found then
      raise exception 'No se encontro la venta seleccionada.' using errcode = 'P0002';
    end if;

    update public.products p
    set stock = p.stock + previous.quantity
    from (
      select product_id, sum(quantity)::integer as quantity
      from public.sale_items
      where sale_id = v_sale_id
      group by product_id
    ) previous
    where p.id = previous.product_id;
  end if;

  perform 1
  from public.products p
  where p.id in (
    select distinct (item->>'productId')::uuid
    from jsonb_array_elements(p_items) item
  )
  order by p.id
  for update;

  select count(*)
    into v_missing_products
  from (
    select distinct (item->>'productId')::uuid as product_id
    from jsonb_array_elements(p_items) item
  ) requested
  left join public.products p on p.id = requested.product_id
  where p.id is null;

  if v_missing_products > 0 then
    raise exception 'No se encontraron todos los productos seleccionados.' using errcode = 'P0002';
  end if;

  select p.name
    into v_insufficient_product
  from (
    select
      (item->>'productId')::uuid as product_id,
      sum((item->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) item
    group by (item->>'productId')::uuid
  ) requested
  join public.products p on p.id = requested.product_id
  where requested.quantity <= 0 or p.stock < requested.quantity
  limit 1;

  if v_insufficient_product is not null then
    raise exception 'Stock insuficiente para %.', v_insufficient_product using errcode = '23514';
  end if;

  select
    coalesce(sum((item->>'quantity')::integer * (item->>'unitPrice')::numeric), 0),
    coalesce(sum((item->>'quantity')::integer * p.cost), 0)
    into v_subtotal, v_cost_total
  from jsonb_array_elements(p_items) item
  join public.products p on p.id = (item->>'productId')::uuid;

  select coalesce(sum((payment->>'amount')::numeric), 0)
    into v_payment_total
  from jsonb_array_elements(p_payments) payment;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) payment
    where (payment->>'amount')::numeric <= 0
       or coalesce(nullif(payment->>'method', ''), '') = ''
  ) then
    raise exception 'Revisa los medios de pago y sus montos.' using errcode = '22023';
  end if;

  if abs(v_payment_total - v_subtotal) > 0.01 then
    raise exception 'La suma de los medios de pago debe coincidir con el total.' using errcode = '22023';
  end if;

  v_profit_total := v_subtotal - v_cost_total;

  if v_sale_id is null then
    v_action := 'insert';
    v_sale_number := public.generate_sale_number();

    insert into public.sales (
      sale_number,
      subtotal,
      cost_total,
      profit_total,
      notes,
      sold_at,
      created_by
    )
    values (
      v_sale_number,
      v_subtotal,
      v_cost_total,
      v_profit_total,
      nullif(p_notes, ''),
      p_sold_at,
      v_user_id
    )
    returning id into v_sale_id;
  else
    v_action := 'update';
    select sale_number into v_sale_number from public.sales where id = v_sale_id;

    update public.sales
    set
      subtotal = v_subtotal,
      cost_total = v_cost_total,
      profit_total = v_profit_total,
      notes = nullif(p_notes, ''),
      sold_at = p_sold_at
    where id = v_sale_id;
  end if;

  delete from public.sale_items where sale_id = v_sale_id;
  delete from public.sale_payments where sale_id = v_sale_id;
  delete from public.stock_movements where reference_id = v_sale_id and movement_type = 'sale';
  delete from public.movimientos_stock where referencia_tabla = 'sales' and referencia_id = v_sale_id;
  delete from public.movimientos_caja where referencia_tabla = 'sales' and referencia_id = v_sale_id;

  insert into public.sale_items (sale_id, product_id, quantity, unit_price, unit_cost, total)
  select
    v_sale_id,
    (item->>'productId')::uuid,
    (item->>'quantity')::integer,
    (item->>'unitPrice')::numeric,
    p.cost,
    (item->>'quantity')::integer * (item->>'unitPrice')::numeric
  from jsonb_array_elements(p_items) item
  join public.products p on p.id = (item->>'productId')::uuid;

  insert into public.sale_payments (sale_id, method, amount)
  select
    v_sale_id,
    payment->>'method',
    (payment->>'amount')::numeric
  from jsonb_array_elements(p_payments) payment;

  update public.products p
  set stock = p.stock - requested.quantity
  from (
    select
      (item->>'productId')::uuid as product_id,
      sum((item->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) item
    group by (item->>'productId')::uuid
  ) requested
  where p.id = requested.product_id;

  insert into public.stock_movements (product_id, movement_type, quantity, reference_id, notes)
  select
    (item->>'productId')::uuid,
    'sale',
    -((item->>'quantity')::integer),
    v_sale_id,
    coalesce(nullif(p_notes, ''), 'Venta manual')
  from jsonb_array_elements(p_items) item;

  insert into public.movimientos_stock (
    producto_id,
    tipo,
    cantidad,
    descripcion,
    referencia_tabla,
    referencia_id,
    created_by
  )
  select
    (item->>'productId')::uuid,
    'salida',
    (item->>'quantity')::integer,
    coalesce(nullif(p_notes, ''), 'Venta manual'),
    'sales',
    v_sale_id,
    v_user_id
  from jsonb_array_elements(p_items) item;

  insert into public.movimientos_caja (
    tipo,
    monto,
    medio_pago,
    descripcion,
    referencia_tabla,
    referencia_id,
    created_by,
    fecha
  )
  select
    'venta',
    (payment->>'amount')::numeric,
    payment->>'method',
    'Venta ' || v_sale_number,
    'sales',
    v_sale_id,
    v_user_id,
    p_sold_at
  from jsonb_array_elements(p_payments) payment;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'sales',
    v_sale_id::text,
    v_action,
    jsonb_build_object(
      'sale_number', v_sale_number,
      'subtotal', v_subtotal,
      'cost_total', v_cost_total,
      'profit_total', v_profit_total,
      'items', p_items,
      'payments', p_payments
    ),
    v_user_id
  );

  return jsonb_build_object(
    'id', v_sale_id,
    'sale_number', v_sale_number,
    'action', v_action
  );
end;
$$;

revoke all on function public.save_sale_atomic(uuid, timestamptz, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_sale_atomic(uuid, timestamptz, jsonb, jsonb, text) to authenticated, service_role;

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
      coalesce(nullif(p_payload->>'budget_response_notes', ''), nullif(p_payload->>'internal_observations', ''))
    );
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values ('repair_access_orders', p_order_id::text, 'update', p_payload, v_user_id);

  return jsonb_build_object('id', p_order_id);
end;
$$;

revoke all on function public.save_repair_access_technical(uuid, jsonb) from public, anon;
grant execute on function public.save_repair_access_technical(uuid, jsonb) to authenticated, service_role;

create or replace function public.update_repair_access_status_atomic(
  p_order_id uuid,
  p_status text,
  p_finished_at timestamptz,
  p_history_notes text,
  p_order_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_status text;
  v_is_paid boolean;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select status, is_paid
    into v_previous_status, v_is_paid
  from public.repair_access_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontro la orden seleccionada.' using errcode = 'P0002';
  end if;

  if p_order_notes is not null and v_is_paid then
    raise exception 'La orden ya esta cobrada. Primero reverti el cobro para no desincronizar caja.' using errcode = '23514';
  end if;

  update public.repair_access_orders
  set
    status = p_status,
    finished_at = p_finished_at,
    notes = case when p_order_notes is null then notes else p_order_notes end,
    updated_by = v_user_id,
    updated_at = now()
  where id = p_order_id;

  if v_previous_status is distinct from p_status then
    insert into public.repair_access_status_history (
      repair_order_id,
      previous_status,
      next_status,
      changed_by,
      notes
    )
    values (p_order_id, v_previous_status, p_status, v_user_id, nullif(p_history_notes, ''));
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'repair_access_orders',
    p_order_id::text,
    'update',
    jsonb_build_object('status', p_status, 'finished_at', p_finished_at, 'notes', p_order_notes),
    v_user_id
  );

  return jsonb_build_object('id', p_order_id);
end;
$$;

revoke all on function public.update_repair_access_status_atomic(uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.update_repair_access_status_atomic(uuid, text, timestamptz, text, text) to authenticated, service_role;

create or replace function public.delete_sale_atomic(p_sale_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_sale_number text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if coalesce(v_role, 'empleado') <> 'admin' then
    raise exception 'Solo un administrador puede eliminar ventas.' using errcode = '42501';
  end if;

  select sale_number
    into v_sale_number
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'No se encontro la venta seleccionada.' using errcode = 'P0002';
  end if;

  update public.products p
  set stock = p.stock + previous.quantity
  from (
    select product_id, sum(quantity)::integer as quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by product_id
  ) previous
  where p.id = previous.product_id;

  delete from public.stock_movements where reference_id = p_sale_id and movement_type = 'sale';
  delete from public.movimientos_stock where referencia_tabla = 'sales' and referencia_id = p_sale_id;
  delete from public.movimientos_caja where referencia_tabla = 'sales' and referencia_id = p_sale_id;
  delete from public.sales where id = p_sale_id;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values ('sales', p_sale_id::text, 'delete', jsonb_build_object('sale_number', v_sale_number), v_user_id);

  return jsonb_build_object('id', p_sale_id);
end;
$$;

revoke all on function public.delete_sale_atomic(uuid) from public, anon;
grant execute on function public.delete_sale_atomic(uuid) to authenticated, service_role;
