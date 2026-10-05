-- Separate what each member earns from the accounts that fund the withdrawal.

alter table public.salary_liquidations
  add column if not exists withdrawal_date date,
  add column if not exists salary_mass_snapshot numeric(14,2) not null default 0,
  add column if not exists salary_amount numeric(14,2) not null default 0,
  add column if not exists profit_share_amount numeric(14,2) not null default 0,
  add column if not exists total_amount numeric(14,2) not null default 0;

update public.salary_liquidations sl
set
  withdrawal_date = coalesce(
    (select min(sw.withdrawal_date) from public.salary_withdrawals sw where sw.liquidation_id = sl.id),
    sl.created_at::date
  ),
  salary_mass_snapshot = coalesce(
    (select sum(sm.target_amount) from public.salary_members sm where sm.is_active),
    0
  ),
  salary_amount = sl.allocated_total,
  profit_share_amount = 0,
  total_amount = sl.allocated_total
where sl.withdrawal_date is null;

alter table public.salary_liquidations
  alter column withdrawal_date set not null;

alter table public.salary_liquidations
  drop constraint if exists salary_liquidations_amount_breakdown_check;
alter table public.salary_liquidations
  add constraint salary_liquidations_amount_breakdown_check
  check (
    salary_amount >= 0
    and profit_share_amount >= 0
    and total_amount > 0
    and total_amount = salary_amount + profit_share_amount
  );

create table if not exists public.salary_liquidation_members (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references public.salary_liquidations(id) on delete cascade,
  member_id uuid not null references public.salary_members(id) on delete restrict,
  member_name_snapshot text not null,
  target_amount_snapshot numeric(14,2) not null check (target_amount_snapshot > 0),
  salary_amount numeric(14,2) not null default 0 check (salary_amount >= 0),
  profit_share_amount numeric(14,2) not null default 0 check (profit_share_amount >= 0),
  total_amount numeric(14,2) generated always as (salary_amount + profit_share_amount) stored,
  salary_coverage_percentage numeric(8,4) not null check (salary_coverage_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  unique (liquidation_id, member_id)
);

create table if not exists public.salary_liquidation_funding (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references public.salary_liquidations(id) on delete cascade,
  payment_method text not null check (payment_method in ('efectivo', 'nx', 'mp')),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (liquidation_id, payment_method)
);

insert into public.salary_liquidation_members (
  liquidation_id,
  member_id,
  member_name_snapshot,
  target_amount_snapshot,
  salary_amount,
  profit_share_amount,
  salary_coverage_percentage
)
select
  sw.liquidation_id,
  sw.member_id,
  coalesce(sm.name, 'Integrante'),
  coalesce(max(sw.target_amount_snapshot), max(sm.target_amount)),
  sum(sw.amount),
  0,
  coalesce(max(sw.coverage_percentage), 0)
from public.salary_withdrawals sw
join public.salary_members sm on sm.id = sw.member_id
where sw.withdrawal_type = 'salary'
  and sw.liquidation_id is not null
  and sw.member_id is not null
group by sw.liquidation_id, sw.member_id, sm.name
on conflict (liquidation_id, member_id) do nothing;

insert into public.salary_liquidation_funding (liquidation_id, payment_method, amount)
select sw.liquidation_id, mc.medio_pago, sum(mc.monto)
from public.salary_withdrawals sw
join public.movimientos_caja mc
  on mc.referencia_tabla = 'salary_withdrawals'
 and mc.referencia_id = sw.id
where sw.withdrawal_type = 'salary'
  and sw.liquidation_id is not null
group by sw.liquidation_id, mc.medio_pago
on conflict (liquidation_id, payment_method) do nothing;

alter table public.salary_liquidation_members enable row level security;
alter table public.salary_liquidation_funding enable row level security;

grant select, insert, update, delete on public.salary_liquidation_members to authenticated, service_role;
grant select, insert, update, delete on public.salary_liquidation_funding to authenticated, service_role;

drop policy if exists salary_liquidation_members_admin_all on public.salary_liquidation_members;
create policy salary_liquidation_members_admin_all on public.salary_liquidation_members
for all to authenticated
using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

drop policy if exists salary_liquidation_funding_admin_all on public.salary_liquidation_funding;
create policy salary_liquidation_funding_admin_all on public.salary_liquidation_funding
for all to authenticated
using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

create index if not exists salary_liquidation_members_member_idx
  on public.salary_liquidation_members (member_id);
create index if not exists salary_liquidation_funding_method_idx
  on public.salary_liquidation_funding (payment_method);

create or replace function public.get_salary_profit_share_snapshot(p_period_month date)
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
    raise exception 'Solo un administrador puede consultar liquidaciones.' using errcode = '42501';
  end if;
  if p_period_month is null then
    raise exception 'Selecciona un mes válido.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'member_payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', sm.id,
        'salary_paid', coalesce(paid.salary_paid, 0),
        'profit_share_paid', coalesce(paid.profit_share_paid, 0)
      ) order by sm.sort_order, sm.name)
      from public.salary_members sm
      left join (
        select slm.member_id,
          sum(slm.salary_amount)::numeric as salary_paid,
          sum(slm.profit_share_amount)::numeric as profit_share_paid
        from public.salary_liquidation_members slm
        join public.salary_liquidations sl on sl.id = slm.liquidation_id
        where sl.period_month = v_month
        group by slm.member_id
      ) paid on paid.member_id = sm.id
      where sm.is_active
    ), '[]'::jsonb),
    'liquidations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sl.id,
        'period_month', sl.period_month,
        'withdrawal_date', sl.withdrawal_date,
        'intended_total', sl.intended_total,
        'salary_mass_snapshot', sl.salary_mass_snapshot,
        'salary_amount', sl.salary_amount,
        'profit_share_amount', sl.profit_share_amount,
        'total_amount', sl.total_amount,
        'coverage_percentage', sl.coverage_percentage,
        'notes', coalesce(sl.notes, ''),
        'created_at', sl.created_at,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'member_id', slm.member_id,
            'member_name', slm.member_name_snapshot,
            'target_amount', slm.target_amount_snapshot,
            'salary_amount', slm.salary_amount,
            'profit_share_amount', slm.profit_share_amount,
            'total_amount', slm.total_amount,
            'coverage_percentage', slm.salary_coverage_percentage
          ) order by sm.sort_order, slm.member_name_snapshot)
          from public.salary_liquidation_members slm
          left join public.salary_members sm on sm.id = slm.member_id
          where slm.liquidation_id = sl.id
        ), '[]'::jsonb),
        'funding', coalesce((
          select jsonb_agg(jsonb_build_object(
            'payment_method', slf.payment_method,
            'amount', slf.amount
          ) order by slf.payment_method)
          from public.salary_liquidation_funding slf
          where slf.liquidation_id = sl.id
        ), '[]'::jsonb)
      ) order by sl.withdrawal_date desc, sl.created_at desc)
      from public.salary_liquidations sl
      where sl.period_month = v_month
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.confirm_salary_liquidation(date, date, numeric, jsonb, text, uuid);

create function public.confirm_salary_liquidation(
  p_period_month date,
  p_withdrawal_date date,
  p_intended_total numeric,
  p_allocations jsonb,
  p_funding_sources jsonb,
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
  v_paid_salary_cents bigint;
  v_remaining_salary_cents bigint;
  v_intended_cents bigint;
  v_salary_cents bigint;
  v_profit_cents bigint;
  v_coverage numeric(8,4);
  v_member_count integer;
  v_liquidation_id uuid;
  v_member record;
  v_allocation jsonb;
  v_allocation_count integer;
  v_allocation_distinct integer;
  v_funding jsonb;
  v_method text;
  v_amount_cents bigint;
  v_funding_count integer;
  v_funding_distinct integer;
  v_funding_total_cents bigint;
  v_has_invalid_funding boolean;
  v_has_overdraw boolean;
begin
  if v_user_id is null
     or coalesce((select role from public.profiles where id = v_user_id), '') <> 'admin' then
    raise exception 'Solo un administrador puede confirmar retiros de sueldos.' using errcode = '42501';
  end if;
  if p_period_month is null or p_withdrawal_date is null or p_idempotency_key is null
     or coalesce(p_intended_total, 0) <= 0
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_typeof(p_funding_sources) <> 'array' then
    raise exception 'Revisa los datos del retiro.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('salary:' || v_month::text, 0));

  select id into v_liquidation_id
  from public.salary_liquidations
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_liquidation_id, 'duplicate', true);
  end if;

  with member_state as (
    select
      sm.id,
      round(sm.target_amount * 100)::bigint as target_cents,
      coalesce(sum(slm.salary_amount * 100) filter (where sl.id is not null), 0)::bigint as paid_cents
    from public.salary_members sm
    left join public.salary_liquidation_members slm on slm.member_id = sm.id
    left join public.salary_liquidations sl
      on sl.id = slm.liquidation_id and sl.period_month = v_month
    where sm.is_active
    group by sm.id, sm.target_amount
  )
  select
    count(*)::integer,
    coalesce(sum(target_cents), 0)::bigint,
    coalesce(sum(least(paid_cents, target_cents)), 0)::bigint
  into v_member_count, v_mass_cents, v_paid_salary_cents
  from member_state;

  if v_member_count <= 0 or v_mass_cents <= 0 then
    raise exception 'No hay integrantes activos configurados.' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct value->>'memberId')::integer
  into v_allocation_count, v_allocation_distinct
  from jsonb_array_elements(p_allocations);

  if v_allocation_count <> v_member_count or v_allocation_distinct <> v_member_count then
    raise exception 'La distribución de integrantes no coincide con la configuración actual.' using errcode = '22023';
  end if;

  v_intended_cents := round(p_intended_total * 100)::bigint;
  v_remaining_salary_cents := greatest(v_mass_cents - v_paid_salary_cents, 0);
  v_salary_cents := least(v_intended_cents, v_remaining_salary_cents);
  v_profit_cents := greatest(v_intended_cents - v_salary_cents, 0);
  v_coverage := round(((v_paid_salary_cents + v_salary_cents)::numeric / v_mass_cents::numeric) * 100, 4);

  with funding_rows as (
    select
      lower(btrim(value->>'paymentMethod')) as method,
      round(coalesce((value->>'amount')::numeric, 0) * 100)::bigint as amount_cents
    from jsonb_array_elements(p_funding_sources)
  ),
  methods(method, fallback_opening) as (
    values ('efectivo'::text, 193573::numeric), ('nx'::text, 60344::numeric), ('mp'::text, 10000::numeric)
  ),
  cash_settings as (
    select value from public.app_settings where key = 'cash_runtime'
  ),
  movement_totals as (
    select medio_pago as method,
      coalesce(sum(monto) filter (where tipo in ('venta', 'reparacion', 'facturacion')), 0)::numeric as income,
      coalesce(sum(monto) filter (where tipo in ('gasto', 'sueldo')), 0)::numeric as outcome
    from public.movimientos_caja
    where fecha >= coalesce(
      (select nullif(value->>'movementCutoff', '')::timestamptz from cash_settings),
      '2026-04-16T14:21:01.222Z'::timestamptz
    )
    group by medio_pago
  ),
  transfer_rows as (
    select case
      when lower(replace(from_payment_method, ' ', '_')) in ('efectivo', 'cash') then 'efectivo'
      when lower(replace(from_payment_method, ' ', '_')) in ('nx', 'nx_santi') then 'nx'
      when lower(replace(from_payment_method, ' ', '_')) in ('mp', 'nx_local') then 'mp'
    end as method, -amount::numeric as delta
    from public.balance_transfers
    union all
    select case
      when lower(replace(to_payment_method, ' ', '_')) in ('efectivo', 'cash') then 'efectivo'
      when lower(replace(to_payment_method, ' ', '_')) in ('nx', 'nx_santi') then 'nx'
      when lower(replace(to_payment_method, ' ', '_')) in ('mp', 'nx_local') then 'mp'
    end as method, amount::numeric as delta
    from public.balance_transfers
  ),
  transfer_totals as (
    select method, coalesce(sum(delta), 0)::numeric as delta
    from transfer_rows where method is not null group by method
  ),
  balances as (
    select methods.method,
      round((
        coalesce(nullif((select value->'openingBalances'->>methods.method from cash_settings), '')::numeric, methods.fallback_opening)
        + coalesce(movement_totals.income, 0)
        - coalesce(movement_totals.outcome, 0)
        + coalesce(transfer_totals.delta, 0)
      ) * 100)::bigint as balance_cents
    from methods
    left join movement_totals using (method)
    left join transfer_totals using (method)
  )
  select
    count(*)::integer,
    count(distinct funding_rows.method)::integer,
    coalesce(sum(funding_rows.amount_cents), 0)::bigint,
    coalesce(bool_or(
      funding_rows.method not in ('efectivo', 'nx', 'mp') or funding_rows.amount_cents < 0
    ), false),
    coalesce(bool_or(
      funding_rows.amount_cents > 0 and funding_rows.amount_cents > coalesce(balances.balance_cents, -1)
    ), false)
  into v_funding_count, v_funding_distinct, v_funding_total_cents, v_has_invalid_funding, v_has_overdraw
  from funding_rows
  left join balances on balances.method = funding_rows.method;

  if v_funding_count = 0 or v_funding_count <> v_funding_distinct or v_has_invalid_funding then
    raise exception 'Revisa las cuentas seleccionadas.' using errcode = '22023';
  end if;
  if v_funding_total_cents <> v_intended_cents then
    raise exception 'La suma de las cuentas debe coincidir exactamente con el retiro total.' using errcode = '22023';
  end if;
  if v_has_overdraw then
    raise exception 'Una de las cuentas no tiene saldo suficiente para este retiro.' using errcode = '22023';
  end if;

  insert into public.salary_liquidations (
    period_month, withdrawal_date, intended_total, allocated_total,
    salary_mass_snapshot, salary_amount, profit_share_amount, total_amount,
    coverage_percentage, excess_amount, notes, idempotency_key, created_by
  ) values (
    v_month, p_withdrawal_date, p_intended_total, p_intended_total,
    v_mass_cents::numeric / 100, v_salary_cents::numeric / 100,
    v_profit_cents::numeric / 100, v_intended_cents::numeric / 100,
    v_coverage, v_profit_cents::numeric / 100, nullif(p_notes, ''),
    p_idempotency_key, v_user_id
  ) returning id into v_liquidation_id;

  for v_member in
    with member_state as (
      select
        sm.id, sm.name, sm.target_amount, sm.sort_order,
        round(sm.target_amount * 100)::bigint as target_cents,
        least(
          coalesce(sum(slm.salary_amount * 100) filter (where sl.id is not null), 0)::bigint,
          round(sm.target_amount * 100)::bigint
        ) as paid_cents
      from public.salary_members sm
      left join public.salary_liquidation_members slm on slm.member_id = sm.id
      left join public.salary_liquidations sl
        on sl.id = slm.liquidation_id and sl.period_month = v_month
      where sm.is_active
      group by sm.id, sm.name, sm.target_amount, sm.sort_order
    ),
    bases as (
      select member_state.*,
        greatest(target_cents - paid_cents, 0) as remaining_cents,
        case when v_remaining_salary_cents > 0
          then (v_salary_cents * greatest(target_cents - paid_cents, 0)) / v_remaining_salary_cents
          else 0 end as salary_base,
        case when v_remaining_salary_cents > 0
          then (v_salary_cents * greatest(target_cents - paid_cents, 0)) % v_remaining_salary_cents
          else 0 end as salary_remainder,
        v_profit_cents / v_member_count as profit_base,
        v_profit_cents % v_member_count as profit_remainder_count
      from member_state
    ),
    ranked as (
      select bases.*,
        row_number() over (order by salary_remainder desc, sort_order, id) as salary_rank,
        v_salary_cents - sum(salary_base) over () as salary_cents_to_distribute,
        row_number() over (order by sort_order, id) as profit_rank
      from bases
    )
    select *,
      salary_base + case when salary_rank <= salary_cents_to_distribute then 1 else 0 end as salary_due_cents,
      profit_base + case when profit_rank <= profit_remainder_count then 1 else 0 end as profit_due_cents
    from ranked
    order by sort_order, name
  loop
    select count(*), (jsonb_agg(value)->0)
    into v_allocation_count, v_allocation
    from jsonb_array_elements(p_allocations)
    where value->>'memberId' = v_member.id::text;

    if v_allocation_count <> 1
       or round(coalesce((v_allocation->>'salaryAmount')::numeric, -1) * 100)::bigint <> v_member.salary_due_cents
       or round(coalesce((v_allocation->>'profitShareAmount')::numeric, -1) * 100)::bigint <> v_member.profit_due_cents
       or round(coalesce((v_allocation->>'totalAmount')::numeric, -1) * 100)::bigint
          <> v_member.salary_due_cents + v_member.profit_due_cents then
      raise exception 'La distribución cambió. Actualiza la página antes de confirmar.' using errcode = '40001';
    end if;

    insert into public.salary_liquidation_members (
      liquidation_id, member_id, member_name_snapshot, target_amount_snapshot,
      salary_amount, profit_share_amount, salary_coverage_percentage
    ) values (
      v_liquidation_id, v_member.id, v_member.name, v_member.target_amount,
      v_member.salary_due_cents::numeric / 100,
      v_member.profit_due_cents::numeric / 100,
      v_coverage
    );
  end loop;

  for v_funding in select value from jsonb_array_elements(p_funding_sources)
  loop
    v_method := lower(btrim(v_funding->>'paymentMethod'));
    v_amount_cents := round(coalesce((v_funding->>'amount')::numeric, 0) * 100)::bigint;
    if v_amount_cents <= 0 then continue; end if;

    insert into public.salary_liquidation_funding (liquidation_id, payment_method, amount)
    values (v_liquidation_id, v_method, v_amount_cents::numeric / 100);

    insert into public.movimientos_caja (
      tipo, monto, medio_pago, descripcion, referencia_tabla, referencia_id, created_by, fecha
    ) values (
      'sueldo', v_amount_cents::numeric / 100, v_method,
      'Retiro de sueldos ' || to_char(v_month, 'MM/YYYY'),
      'salary_liquidations', v_liquidation_id, v_user_id,
      p_withdrawal_date::timestamp at time zone 'America/Argentina/Buenos_Aires'
    );
  end loop;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'salary_liquidations', v_liquidation_id::text, 'insert',
    jsonb_build_object(
      'period_month', v_month,
      'withdrawal_date', p_withdrawal_date,
      'salary_amount', v_salary_cents::numeric / 100,
      'profit_share_amount', v_profit_cents::numeric / 100,
      'total_amount', v_intended_cents::numeric / 100,
      'funding', p_funding_sources
    ),
    v_user_id
  );

  return jsonb_build_object(
    'id', v_liquidation_id,
    'duplicate', false,
    'salary_amount', v_salary_cents::numeric / 100,
    'profit_share_amount', v_profit_cents::numeric / 100,
    'total_amount', v_intended_cents::numeric / 100
  );
end;
$$;

revoke all on function public.get_salary_profit_share_snapshot(date) from public, anon;
revoke all on function public.confirm_salary_liquidation(date, date, numeric, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.get_salary_profit_share_snapshot(date) to authenticated, service_role;
grant execute on function public.confirm_salary_liquidation(date, date, numeric, jsonb, jsonb, text, uuid) to authenticated, service_role;
