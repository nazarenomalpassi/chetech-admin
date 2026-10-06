-- Monthly salary planning and merchandise replenishment.
-- Existing salary withdrawals remain valid and are classified as extraordinary.

create table if not exists public.salary_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  target_amount numeric(14,2) not null check (target_amount > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_reserves (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.salary_liquidations (
  id uuid primary key default gen_random_uuid(),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  intended_total numeric(14,2) not null check (intended_total >= 0),
  allocated_total numeric(14,2) not null default 0 check (allocated_total >= 0),
  coverage_percentage numeric(8,4) not null default 0 check (coverage_percentage between 0 and 100),
  excess_amount numeric(14,2) not null default 0 check (excess_amount >= 0),
  notes text,
  idempotency_key uuid not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.replenishment_plan_items (
  id uuid primary key default gen_random_uuid(),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_to_order integer not null default 0 check (quantity_to_order >= 0),
  status text not null default 'pending' check (status in ('pending', 'added', 'ordered', 'received')),
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_month, product_id)
);

alter table public.salary_withdrawals
  add column if not exists member_id uuid references public.salary_members(id) on delete restrict,
  add column if not exists liquidation_id uuid references public.salary_liquidations(id) on delete restrict,
  add column if not exists salary_period date,
  add column if not exists withdrawal_type text not null default 'extraordinary',
  add column if not exists target_amount_snapshot numeric(14,2),
  add column if not exists coverage_percentage numeric(8,4);

alter table public.salary_withdrawals
  drop constraint if exists salary_withdrawals_withdrawal_type_check;
alter table public.salary_withdrawals
  add constraint salary_withdrawals_withdrawal_type_check
  check (withdrawal_type in ('salary', 'extraordinary'));

alter table public.salary_withdrawals
  drop constraint if exists salary_withdrawals_salary_period_check;
alter table public.salary_withdrawals
  add constraint salary_withdrawals_salary_period_check
  check (salary_period is null or salary_period = date_trunc('month', salary_period)::date);

create index if not exists salary_members_active_sort_idx
  on public.salary_members (is_active, sort_order, name);
create index if not exists financial_reserves_active_sort_idx
  on public.financial_reserves (is_active, sort_order, name);
create index if not exists salary_liquidations_period_idx
  on public.salary_liquidations (period_month desc, created_at desc);
create index if not exists salary_withdrawals_period_member_idx
  on public.salary_withdrawals (salary_period, member_id)
  where withdrawal_type = 'salary';
create index if not exists replenishment_plan_period_idx
  on public.replenishment_plan_items (period_month desc, status);

insert into public.salary_members (name, target_amount, sort_order)
values
  ('Nazareno', 800000, 10),
  ('Matías Grandi', 300000, 20),
  ('Juanma Pítaro', 300000, 30),
  ('Santiago Pítaro', 300000, 40)
on conflict (name) do nothing;

insert into public.financial_reserves (code, name, amount, sort_order)
values
  ('rent', 'Próximo alquiler', 450000, 10),
  ('repairs', 'Fondo para reparaciones', 300000, 20),
  ('other', 'Otros compromisos', 0, 30)
on conflict (code) do nothing;

alter table public.salary_members enable row level security;
alter table public.financial_reserves enable row level security;
alter table public.salary_liquidations enable row level security;
alter table public.replenishment_plan_items enable row level security;

grant select, insert, update, delete on public.salary_members to authenticated, service_role;
grant select, insert, update, delete on public.financial_reserves to authenticated, service_role;
grant select, insert, update, delete on public.salary_liquidations to authenticated, service_role;
grant select, insert, update, delete on public.replenishment_plan_items to authenticated, service_role;

drop policy if exists salary_members_admin_all on public.salary_members;
create policy salary_members_admin_all on public.salary_members
for all to authenticated
using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

drop policy if exists financial_reserves_admin_all on public.financial_reserves;
create policy financial_reserves_admin_all on public.financial_reserves
for all to authenticated
using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

drop policy if exists salary_liquidations_admin_all on public.salary_liquidations;
create policy salary_liquidations_admin_all on public.salary_liquidations
for all to authenticated
using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

drop policy if exists replenishment_plan_items_admin_all on public.replenishment_plan_items;
create policy replenishment_plan_items_admin_all on public.replenishment_plan_items
for all to authenticated
using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

create or replace function public.get_salary_planning_snapshot(p_period_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_next_month date := (date_trunc('month', p_period_month) + interval '1 month')::date;
  v_cutoff timestamptz;
begin
  if auth.role() <> 'service_role'
     and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar la planificación salarial.' using errcode = '42501';
  end if;

  if p_period_month is null then
    raise exception 'Selecciona un mes válido.' using errcode = '22023';
  end if;

  select coalesce(
    nullif(value->>'movementCutoff', '')::timestamptz,
    '2026-04-16T14:21:01.222Z'::timestamptz
  )
  into v_cutoff
  from public.app_settings
  where key = 'cash_runtime';
  v_cutoff := coalesce(v_cutoff, '2026-04-16T14:21:01.222Z'::timestamptz);

  return (
    with methods(method, label, fallback_opening) as (
      values
        ('efectivo'::text, 'EFECTIVO'::text, 193573::numeric),
        ('nx'::text, 'NX SANTI'::text, 60344::numeric),
        ('mp'::text, 'NX LOCAL'::text, 10000::numeric)
    ),
    cash_settings as (
      select value from public.app_settings where key = 'cash_runtime'
    ),
    movement_totals as (
      select
        medio_pago as method,
        coalesce(sum(monto) filter (where tipo in ('venta', 'reparacion', 'facturacion')), 0)::numeric as income,
        coalesce(sum(monto) filter (where tipo in ('gasto', 'sueldo')), 0)::numeric as outcome
      from public.movimientos_caja
      where fecha >= v_cutoff
      group by medio_pago
    ),
    transfer_rows as (
      select
        case
          when lower(replace(from_payment_method, ' ', '_')) in ('efectivo', 'cash') then 'efectivo'
          when lower(replace(from_payment_method, ' ', '_')) in ('nx', 'nx_santi') then 'nx'
          when lower(replace(from_payment_method, ' ', '_')) in ('mp', 'nx_local') then 'mp'
        end as method,
        -amount::numeric as delta
      from public.balance_transfers
      union all
      select
        case
          when lower(replace(to_payment_method, ' ', '_')) in ('efectivo', 'cash') then 'efectivo'
          when lower(replace(to_payment_method, ' ', '_')) in ('nx', 'nx_santi') then 'nx'
          when lower(replace(to_payment_method, ' ', '_')) in ('mp', 'nx_local') then 'mp'
        end as method,
        amount::numeric as delta
      from public.balance_transfers
    ),
    transfer_totals as (
      select method, coalesce(sum(delta), 0)::numeric as delta
      from transfer_rows
      where method is not null
      group by method
    ),
    cash_rows as (
      select
        methods.method,
        methods.label,
        coalesce(
          nullif((select value->'openingBalances'->>methods.method from cash_settings), '')::numeric,
          methods.fallback_opening
        ) as opening_balance,
        coalesce(movement_totals.income, 0)::numeric as income,
        coalesce(movement_totals.outcome, 0)::numeric as outcome,
        coalesce(transfer_totals.delta, 0)::numeric as transfer_delta,
        (
          coalesce(
            nullif((select value->'openingBalances'->>methods.method from cash_settings), '')::numeric,
            methods.fallback_opening
          )
          + coalesce(movement_totals.income, 0)
          - coalesce(movement_totals.outcome, 0)
          + coalesce(transfer_totals.delta, 0)
        )::numeric as balance
      from methods
      left join movement_totals using (method)
      left join transfer_totals using (method)
    ),
    member_rows as (
      select
        sm.id,
        sm.name,
        sm.target_amount,
        sm.sort_order,
        coalesce(sum(sw.amount) filter (
          where sw.withdrawal_type = 'salary' and sw.salary_period = v_month
        ), 0)::numeric as paid_amount
      from public.salary_members sm
      left join public.salary_withdrawals sw on sw.member_id = sm.id
      where sm.is_active
      group by sm.id, sm.name, sm.target_amount, sm.sort_order
    ),
    reserve_rows as (
      select id, code, name, amount, sort_order
      from public.financial_reserves
      where is_active
      order by sort_order, name
    ),
    merchandise_rows as (
      select
        p.id as product_id,
        p.name as product_name,
        p.sku,
        sum(si.quantity)::integer as quantity_sold,
        coalesce(sum(si.total), 0)::numeric as revenue,
        coalesce(sum(si.unit_cost * si.quantity), 0)::numeric as historical_cost,
        coalesce(sum(p.cost * si.quantity), 0)::numeric as current_replacement_cost,
        (coalesce(sum(si.total), 0) - coalesce(sum(si.unit_cost * si.quantity), 0))::numeric as gross_margin,
        p.stock,
        p.cost as current_unit_cost,
        p.sale_price as current_sale_price,
        coalesce(rpi.quantity_to_order, sum(si.quantity)::integer) as quantity_to_order,
        coalesce(rpi.status, 'pending') as order_status,
        coalesce(rpi.notes, '') as order_notes
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      join public.products p on p.id = si.product_id
      left join public.replenishment_plan_items rpi
        on rpi.period_month = v_month and rpi.product_id = p.id
      where s.sold_at >= (v_month::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and s.sold_at < (v_next_month::timestamp at time zone 'America/Argentina/Buenos_Aires')
      group by p.id, p.name, p.sku, p.stock, p.cost, p.sale_price,
               rpi.quantity_to_order, rpi.status, rpi.notes
      order by quantity_sold desc, p.name
    ),
    withdrawal_rows as (
      select
        sw.id,
        sw.withdrawal_date,
        sw.amount,
        sw.payment_method,
        coalesce(sw.notes, '') as notes,
        sw.created_at,
        sw.withdrawal_type,
        sw.salary_period,
        sw.target_amount_snapshot,
        sw.coverage_percentage,
        sm.id as member_id,
        sm.name as member_name
      from public.salary_withdrawals sw
      left join public.salary_members sm on sm.id = sw.member_id
      where sw.withdrawal_date >= v_month and sw.withdrawal_date < v_next_month
      order by sw.withdrawal_date desc, sw.created_at desc
      limit 200
    )
    select jsonb_build_object(
      'period_month', v_month,
      'accounts', coalesce((select jsonb_agg(to_jsonb(cash_rows) order by method) from cash_rows), '[]'::jsonb),
      'total_available', coalesce((select sum(balance) from cash_rows), 0),
      'members', coalesce((select jsonb_agg(to_jsonb(member_rows) order by sort_order, name) from member_rows), '[]'::jsonb),
      'reserves', coalesce((select jsonb_agg(to_jsonb(reserve_rows) order by sort_order, name) from reserve_rows), '[]'::jsonb),
      'merchandise', jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(merchandise_rows) order by quantity_sold desc, product_name) from merchandise_rows), '[]'::jsonb),
        'quantity_sold', coalesce((select sum(quantity_sold) from merchandise_rows), 0),
        'revenue', coalesce((select sum(revenue) from merchandise_rows), 0),
        'historical_cost', coalesce((select sum(historical_cost) from merchandise_rows), 0),
        'current_replacement_cost', coalesce((select sum(current_replacement_cost) from merchandise_rows), 0),
        'gross_margin', coalesce((select sum(gross_margin) from merchandise_rows), 0)
      ),
      'withdrawals', coalesce((select jsonb_agg(to_jsonb(withdrawal_rows) order by withdrawal_date desc, created_at desc) from withdrawal_rows), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.get_replenishment_snapshot(p_period_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_next_month date := (date_trunc('month', p_period_month) + interval '1 month')::date;
begin
  if auth.role() <> 'service_role'
     and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar pedidos.' using errcode = '42501';
  end if;

  if p_period_month is null then
    raise exception 'Selecciona un mes válido.' using errcode = '22023';
  end if;

  return (
    with item_rows as (
      select
        p.id as product_id,
        p.name as product_name,
        p.sku,
        sum(si.quantity)::integer as quantity_sold,
        p.stock,
        p.cost as current_unit_cost,
        p.sale_price as current_sale_price,
        coalesce(sum(si.total), 0)::numeric as revenue,
        coalesce(sum(si.unit_cost * si.quantity), 0)::numeric as historical_cost,
        coalesce(sum(p.cost * si.quantity), 0)::numeric as current_replacement_cost,
        coalesce(rpi.quantity_to_order, sum(si.quantity)::integer) as quantity_to_order,
        coalesce(rpi.status, 'pending') as status,
        coalesce(rpi.notes, '') as notes,
        null::text as supplier
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      join public.products p on p.id = si.product_id
      left join public.replenishment_plan_items rpi
        on rpi.period_month = v_month and rpi.product_id = p.id
      where s.sold_at >= (v_month::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and s.sold_at < (v_next_month::timestamp at time zone 'America/Argentina/Buenos_Aires')
      group by p.id, p.name, p.sku, p.stock, p.cost, p.sale_price,
               rpi.quantity_to_order, rpi.status, rpi.notes
      order by quantity_sold desc, p.name
    )
    select jsonb_build_object(
      'period_month', v_month,
      'items', coalesce((select jsonb_agg(to_jsonb(item_rows) order by quantity_sold desc, product_name) from item_rows), '[]'::jsonb),
      'summary', jsonb_build_object(
        'product_count', coalesce((select count(*) from item_rows), 0),
        'quantity_sold', coalesce((select sum(quantity_sold) from item_rows), 0),
        'historical_cost', coalesce((select sum(historical_cost) from item_rows), 0),
        'suggested_replacement_cost', coalesce((select sum(current_replacement_cost) from item_rows), 0),
        'order_total', coalesce((select sum(quantity_to_order * current_unit_cost) from item_rows), 0)
      )
    )
  );
end;
$$;

create or replace function public.save_replenishment_plan_item(
  p_period_month date,
  p_product_id uuid,
  p_quantity_to_order integer,
  p_status text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_month date := date_trunc('month', p_period_month)::date;
  v_id uuid;
begin
  if v_user_id is null
     or coalesce((select role from public.profiles where id = v_user_id), '') <> 'admin' then
    raise exception 'Solo un administrador puede actualizar pedidos.' using errcode = '42501';
  end if;
  if p_period_month is null or p_product_id is null or coalesce(p_quantity_to_order, -1) < 0 then
    raise exception 'Revisa los datos del producto a pedir.' using errcode = '22023';
  end if;
  if p_status not in ('pending', 'added', 'ordered', 'received') then
    raise exception 'Selecciona un estado de pedido válido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'No se encontró el producto.' using errcode = 'P0002';
  end if;

  insert into public.replenishment_plan_items (
    period_month, product_id, quantity_to_order, status, notes, updated_by, updated_at
  )
  values (
    v_month, p_product_id, p_quantity_to_order, p_status, nullif(p_notes, ''), v_user_id, now()
  )
  on conflict (period_month, product_id) do update
  set quantity_to_order = excluded.quantity_to_order,
      status = excluded.status,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'replenishment_plan_items',
    v_id::text,
    'upsert',
    jsonb_build_object(
      'period_month', v_month,
      'product_id', p_product_id,
      'quantity_to_order', p_quantity_to_order,
      'status', p_status,
      'notes', nullif(p_notes, '')
    ),
    v_user_id
  );

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.save_salary_planning_config(p_members jsonb, p_reserves jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_member jsonb;
  v_reserve jsonb;
begin
  if v_user_id is null
     or coalesce((select role from public.profiles where id = v_user_id), '') <> 'admin' then
    raise exception 'Solo un administrador puede actualizar la configuración salarial.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_typeof(p_reserves) <> 'array' then
    raise exception 'La configuración recibida no es válida.' using errcode = '22023';
  end if;

  for v_member in select value from jsonb_array_elements(p_members)
  loop
    if coalesce((v_member->>'targetAmount')::numeric, 0) <= 0 then
      raise exception 'Todos los sueldos objetivo deben ser mayores a cero.' using errcode = '22023';
    end if;
    update public.salary_members
    set target_amount = (v_member->>'targetAmount')::numeric, updated_at = now()
    where id = (v_member->>'id')::uuid;
    if not found then
      raise exception 'No se encontró uno de los integrantes.' using errcode = 'P0002';
    end if;
  end loop;

  for v_reserve in select value from jsonb_array_elements(p_reserves)
  loop
    if coalesce((v_reserve->>'amount')::numeric, -1) < 0 then
      raise exception 'Las reservas no pueden ser negativas.' using errcode = '22023';
    end if;
    update public.financial_reserves
    set amount = (v_reserve->>'amount')::numeric, updated_at = now()
    where id = (v_reserve->>'id')::uuid;
    if not found then
      raise exception 'No se encontró una de las reservas.' using errcode = 'P0002';
    end if;
  end loop;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'salary_planning_config',
    'global',
    'update',
    jsonb_build_object('members', p_members, 'reserves', p_reserves),
    v_user_id
  );

  return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.confirm_salary_liquidation(
  p_period_month date,
  p_withdrawal_date date,
  p_intended_total numeric,
  p_payments jsonb,
  p_notes text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_month date := date_trunc('month', p_period_month)::date;
  v_mass_cents bigint;
  v_intended_cents bigint;
  v_capped_cents bigint;
  v_excess_cents bigint;
  v_coverage numeric(8,4);
  v_liquidation_id uuid;
  v_withdrawal_id uuid;
  v_member record;
  v_payment jsonb;
  v_payment_count integer;
  v_expected_cents bigint;
  v_requested_cents bigint;
  v_batch_cents bigint := 0;
  v_method text;
begin
  if v_user_id is null
     or coalesce((select role from public.profiles where id = v_user_id), '') <> 'admin' then
    raise exception 'Solo un administrador puede confirmar liquidaciones.' using errcode = '42501';
  end if;
  if p_period_month is null or p_withdrawal_date is null or p_idempotency_key is null
     or coalesce(p_intended_total, -1) < 0 or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Revisa los datos de la liquidación.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('salary:' || v_month::text, 0));

  select id into v_liquidation_id
  from public.salary_liquidations
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_liquidation_id, 'duplicate', true);
  end if;

  select coalesce(sum(round(target_amount * 100)::bigint), 0)
  into v_mass_cents
  from public.salary_members
  where is_active;
  if v_mass_cents <= 0 then
    raise exception 'No hay integrantes activos configurados.' using errcode = '22023';
  end if;

  v_intended_cents := round(p_intended_total * 100)::bigint;
  v_capped_cents := least(v_intended_cents, v_mass_cents);
  v_excess_cents := greatest(v_intended_cents - v_mass_cents, 0);
  v_coverage := round((v_capped_cents::numeric / v_mass_cents::numeric) * 100, 4);

  insert into public.salary_liquidations (
    period_month, intended_total, allocated_total, coverage_percentage, excess_amount,
    notes, idempotency_key, created_by
  )
  values (
    v_month, p_intended_total, 0, v_coverage, v_excess_cents::numeric / 100,
    nullif(p_notes, ''), p_idempotency_key, v_user_id
  )
  returning id into v_liquidation_id;

  for v_member in
    with targets as (
      select
        sm.id,
        sm.name,
        sm.target_amount,
        sm.sort_order,
        round(sm.target_amount * 100)::bigint as target_cents,
        coalesce((
          select round(sum(sw.amount) * 100)::bigint
          from public.salary_withdrawals sw
          where sw.member_id = sm.id
            and sw.salary_period = v_month
            and sw.withdrawal_type = 'salary'
        ), 0) as paid_cents
      from public.salary_members sm
      where sm.is_active
    ),
    bases as (
      select
        targets.*,
        (v_capped_cents * target_cents) / v_mass_cents as base_cents,
        (v_capped_cents * target_cents) % v_mass_cents as remainder_cents
      from targets
    ),
    ranked as (
      select
        bases.*,
        row_number() over (order by remainder_cents desc, sort_order, id) as remainder_rank,
        v_capped_cents - sum(base_cents) over () as cents_to_distribute
      from bases
    )
    select
      id,
      name,
      target_amount,
      paid_cents,
      base_cents + case when remainder_rank <= cents_to_distribute then 1 else 0 end as desired_cents
    from ranked
    order by sort_order, name
  loop
    v_expected_cents := greatest(v_member.desired_cents - v_member.paid_cents, 0);
    select count(*), (jsonb_agg(value)->0)
    into v_payment_count, v_payment
    from jsonb_array_elements(p_payments)
    where value->>'memberId' = v_member.id::text;

    if v_expected_cents = 0 then
      if v_payment_count > 0 and round(coalesce((v_payment->>'amount')::numeric, 0) * 100)::bigint > 0 then
        raise exception 'El integrante % no tiene saldo para liquidar en este nivel.', v_member.name using errcode = '22023';
      end if;
      continue;
    end if;
    if v_payment_count <> 1 then
      raise exception 'Selecciona una cuenta para %.', v_member.name using errcode = '22023';
    end if;

    v_requested_cents := round(coalesce((v_payment->>'amount')::numeric, 0) * 100)::bigint;
    if v_requested_cents <> v_expected_cents then
      raise exception 'La distribución de % cambió. Actualiza la página antes de confirmar.', v_member.name using errcode = '40001';
    end if;

    v_method := case
      when lower(btrim(v_payment->>'paymentMethod')) = 'efectivo' then 'efectivo'
      when lower(btrim(v_payment->>'paymentMethod')) = 'nx' then 'nx'
      when lower(btrim(v_payment->>'paymentMethod')) = 'mp' then 'mp'
      else null
    end;
    if v_method is null then
      raise exception 'Selecciona una cuenta válida para %.', v_member.name using errcode = '22023';
    end if;

    insert into public.salary_withdrawals (
      withdrawal_date, amount, payment_method, notes, created_by,
      member_id, liquidation_id, salary_period, withdrawal_type,
      target_amount_snapshot, coverage_percentage
    )
    values (
      p_withdrawal_date, v_expected_cents::numeric / 100, v_method, nullif(p_notes, ''), v_user_id,
      v_member.id, v_liquidation_id, v_month, 'salary',
      v_member.target_amount, v_coverage
    )
    returning id into v_withdrawal_id;

    insert into public.movimientos_caja (
      tipo, monto, medio_pago, descripcion, referencia_tabla, referencia_id, created_by, fecha
    )
    values (
      'sueldo',
      v_expected_cents::numeric / 100,
      v_method,
      'Liquidación ' || v_member.name || ' ' || to_char(v_month, 'MM/YYYY'),
      'salary_withdrawals',
      v_withdrawal_id,
      v_user_id,
      p_withdrawal_date::timestamp at time zone 'America/Argentina/Buenos_Aires'
    );

    v_batch_cents := v_batch_cents + v_expected_cents;
  end loop;

  if v_batch_cents <= 0 then
    raise exception 'No hay un saldo nuevo para liquidar con el monto indicado.' using errcode = '22023';
  end if;

  update public.salary_liquidations
  set allocated_total = v_batch_cents::numeric / 100
  where id = v_liquidation_id;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'salary_liquidations',
    v_liquidation_id::text,
    'insert',
    jsonb_build_object(
      'period_month', v_month,
      'withdrawal_date', p_withdrawal_date,
      'intended_total', p_intended_total,
      'allocated_total', v_batch_cents::numeric / 100,
      'coverage_percentage', v_coverage,
      'excess_amount', v_excess_cents::numeric / 100
    ),
    v_user_id
  );

  return jsonb_build_object(
    'id', v_liquidation_id,
    'duplicate', false,
    'allocated_total', v_batch_cents::numeric / 100
  );
end;
$$;

revoke all on function public.get_salary_planning_snapshot(date) from public, anon;
revoke all on function public.get_replenishment_snapshot(date) from public, anon;
revoke all on function public.save_replenishment_plan_item(date, uuid, integer, text, text) from public, anon;
revoke all on function public.save_salary_planning_config(jsonb, jsonb) from public, anon;
revoke all on function public.confirm_salary_liquidation(date, date, numeric, jsonb, text, uuid) from public, anon;

grant execute on function public.get_salary_planning_snapshot(date) to authenticated, service_role;
grant execute on function public.get_replenishment_snapshot(date) to authenticated, service_role;
grant execute on function public.save_replenishment_plan_item(date, uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.save_salary_planning_config(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.confirm_salary_liquidation(date, date, numeric, jsonb, text, uuid) to authenticated, service_role;
