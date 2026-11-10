begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table if not exists private.workshop_warranty_observation (
  singleton boolean primary key default true check (singleton),
  started_on date not null,
  started_at timestamptz not null,
  -- Retain the actual admin UUID even if their profile is subsequently removed.
  started_by uuid not null,
  check (started_on = (started_at at time zone 'America/Argentina/Buenos_Aires')::date)
);
alter table private.workshop_warranty_observation enable row level security;
revoke all on table private.workshop_warranty_observation from public, anon, authenticated, service_role;

create or replace function private.start_workshop_warranty_observation()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (select private.is_admin()) is not true
    or not exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Solo administradores pueden iniciar la observacion de garantias.' using errcode = '42501';
  end if;
  -- No input date, reset, UPDATE, or automatic start during a metrics read.
  -- Concurrent retries preserve the first start and its actor permanently.
  insert into private.workshop_warranty_observation(singleton, started_on, started_at, started_by)
  values(true, (now() at time zone 'America/Argentina/Buenos_Aires')::date, now(), auth.uid())
  on conflict (singleton) do nothing;
  return (select jsonb_build_object('startedOn', started_on, 'startedAt', started_at, 'startedBy', started_by)
    from private.workshop_warranty_observation where singleton);
end;
$$;

create or replace function public.start_workshop_warranty_observation()
returns jsonb language sql security invoker set search_path = '' as $$
  select private.start_workshop_warranty_observation();
$$;
revoke all on function private.start_workshop_warranty_observation(),
  public.start_workshop_warranty_observation() from public, anon, authenticated, service_role;
grant execute on function private.start_workshop_warranty_observation(),
  public.start_workshop_warranty_observation() to authenticated;

create or replace function private.get_workshop_operational_metrics(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_from date := coalesce(p_from, date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_to date := coalesce(p_to, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_start timestamptz;
  v_end timestamptz;
  v_observation_from date;
begin
  -- Existing helpers are necessary, but exact roles are checked as well: older
  -- current_app_role implementations classified every non-admin as technician.
  if auth.uid() is null or (select private.can_access_operations()) is not true
    or not exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'tecnico')) then
    raise exception 'Sin permiso para consultar las metricas del taller.' using errcode = '42501';
  end if;
  if not isfinite(v_from) or not isfinite(v_to) or v_from > v_to or v_to - v_from > 3660
    or v_from < date '1000-01-01' or v_to > date '9999-12-31' then
    raise exception 'El periodo de metricas no es valido.' using errcode = '22023';
  end if;
  v_start := v_from::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_end := (v_to + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  select started_on into v_observation_from from private.workshop_warranty_observation where singleton;
  return (
    with orders as materialized (
      select o.id, o.status, o.intake_date, o.approval_status, o.imported_at,
        o.picked_up_at, o.delivered_at, o.has_warranty, o.warranty_start, o.warranty_until,
        o.warranty_requires_review,
        (o.status <> 'retirado' and o.delivered_at is null and o.picked_up_at is null) as is_open
      from public.repair_access_orders o
    ), history_base as materialized (
      select h.id, h.repair_order_id as order_id, h.previous_status, h.next_status, h.changed_at,
        (h.previous_status is not null and h.previous_status <> h.next_status
          and coalesce(h.notes, '') <> 'Estado reconstruido durante la importacion historica.'
          and isfinite(h.changed_at) and h.changed_at <= v_now
          and (o.imported_at is null or h.changed_at > o.imported_at)) as is_real,
        (coalesce(h.notes, '') = 'Estado reconstruido durante la importacion historica.'
          or (o.imported_at is not null and h.changed_at <= o.imported_at)) as is_reconstructed,
        count(*) over(partition by h.repair_order_id, h.changed_at) as same_time_count,
        row_number() over(partition by h.repair_order_id order by h.changed_at desc, h.id desc) as latest
      from public.repair_access_status_history h join orders o on o.id = h.repair_order_id
    ), history_sequence as materialized (
      select h.*,
        lead(h.previous_status) over w as following_previous,
        lead(h.changed_at) over w as following_at,
        lead(h.is_real) over w as following_real,
        lead(h.same_time_count) over w as following_ties
      from history_base h window w as (partition by h.order_id order by h.changed_at, h.id)
    ), intervals as materialized (
      select h.*,
        (h.is_real and h.following_real and h.same_time_count = 1 and h.following_ties = 1
          and h.next_status = h.following_previous and h.following_at > h.changed_at
          and h.next_status <> 'retirado') as is_valid,
        extract(epoch from h.following_at - h.changed_at) / 86400.0 as elapsed_days
      from history_sequence h
      where h.following_at >= v_start and h.following_at < v_end and h.following_at <= v_now
    ), activity as (
      select h.order_id, h.changed_at as occurred_at from history_base h where h.is_real and h.same_time_count = 1
      union all
      select e.order_id, e.created_at from public.workshop_events e join orders o on o.id = e.order_id
      where isfinite(e.created_at) and e.created_at <= v_now and (o.imported_at is null or e.created_at > o.imported_at)
        and (e.kind in ('decision', 'part_request', 'part_update', 'delivery')
          or (e.kind = 'update' and nullif(btrim(e.message), '') is not null
            and e.message not in ('Ficha actualizada', 'Responsable actualizado')))
    ), last_activity as (
      select order_id, max(occurred_at) as occurred_at from activity group by order_id
    ), retirement_history as (
      select order_id, max(changed_at) as occurred_at from history_base
      where is_real and same_time_count = 1 and next_status = 'retirado' group by order_id
    ), enriched as materialized (
      select o.*, a.occurred_at as last_activity_at,
        case when isfinite(o.intake_date) and o.intake_date <= v_today then v_today - o.intake_date end as age_days,
        case when h.next_status = 'listo_para_retirar' and h.is_real and h.same_time_count = 1
          then (h.changed_at at time zone 'America/Argentina/Buenos_Aires')::date end as ready_on,
        case when coalesce(o.picked_up_at, o.delivered_at, r.occurred_at) <= v_now
          and isfinite(coalesce(o.picked_up_at, o.delivered_at, r.occurred_at))
          then (coalesce(o.picked_up_at, o.delivered_at, r.occurred_at) at time zone 'America/Argentina/Buenos_Aires')::date end as closed_on
      from orders o left join last_activity a on a.order_id = o.id
      left join history_base h on h.order_id = o.id and h.latest = 1
      left join retirement_history r on r.order_id = o.id
    ), open_orders as materialized (
      select * from enriched where is_open
    ), parts as materialized (
      select p.order_id, p.quantity - p.received_quantity as missing, p.status
      from public.repair_part_requests p join open_orders o on o.id = p.order_id
      where p.status not in ('cancelled', 'installed') and p.quantity > p.received_quantity
    ), daily_intakes as (
      select intake_date as day, count(*) as n from orders
      where intake_date between v_from and least(v_to, v_today) group by intake_date
    ), daily_closures as (
      select closed_on as day, count(*) as n from enriched
      where not is_open and closed_on between v_from and v_to group by closed_on
    ), phase_rows as (
      select next_status as status, count(*) as samples, count(distinct order_id) as orders,
        round((percentile_cont(0.5) within group(order by elapsed_days))::numeric, 2) as "medianDays"
      from intervals where is_valid group by next_status
    ), mature_cohort as materialized (
      select e.id, e.warranty_start, e.warranty_until, coalesce(e.picked_up_at, e.delivered_at) as delivery_at
      from enriched e where not e.is_open and e.has_warranty and not e.warranty_requires_review
        and e.closed_on between v_from and v_to
        and isfinite(e.warranty_start) and isfinite(e.warranty_until)
        and e.warranty_start = e.closed_on and e.warranty_until >= e.warranty_start and e.warranty_until < v_today
        and (v_observation_from is null or e.warranty_start >= v_observation_from)
    ), mature_returns as materialized (
      select m.id, exists(select 1 from public.repair_warranty_returns w
        where w.order_id = m.id and w.received_on between m.warranty_start and m.warranty_until
          and w.original_delivery_at = m.delivery_at
          and w.warranty_start_snapshot = m.warranty_start
          and w.warranty_until_snapshot = m.warranty_until) as has_return,
        exists(select 1 from public.repair_warranty_returns w
          where w.order_id = m.id and w.original_delivery_at = m.delivery_at
            and (w.warranty_start_snapshot is distinct from m.warranty_start
              or w.warranty_until_snapshot is distinct from m.warranty_until)) as inconsistent_coverage
      from mature_cohort m
    )
    select jsonb_build_object(
      'version', 1, 'scope', 'full_workshop', 'asOf', v_today, 'snapshotAt', v_now,
      'period', jsonb_build_object('from', v_from, 'to', v_to),
      'current', jsonb_build_object(
        'openOrders', (select count(*) from open_orders),
        'waitingAuthorization', (select count(*) from open_orders where status = 'presupuestado' and approval_status not in ('accepted', 'rejected')),
        'age', (select jsonb_build_object('days0to7', count(*) filter(where age_days between 0 and 7),
          'days8to14', count(*) filter(where age_days between 8 and 14),
          'days15to30', count(*) filter(where age_days between 15 and 30),
          'days31plus', count(*) filter(where age_days >= 31), 'unknownIntakeOrders', count(*) filter(where age_days is null)) from open_orders),
        'inactivity', (select jsonb_build_object('thresholdDays', 7,
          'staleOrders', count(*) filter(where last_activity_at <= v_now - interval '7 days'),
          'knownActivityOrders', count(*) filter(where last_activity_at is not null),
          'unknownActivityOrders', count(*) filter(where last_activity_at is null)) from open_orders),
        'parts', (select jsonb_build_object('orders', count(distinct order_id), 'requests', count(*),
          'unitsToPurchase', coalesce(sum(missing) filter(where status = 'requested'), 0),
          'unitsInTransit', coalesce(sum(missing) filter(where status <> 'requested'), 0),
          'unitsToReceive', coalesce(sum(missing), 0)) from parts),
        'ready', (select jsonb_build_object('orders', count(*), 'datedOrders', count(ready_on),
          'unknownDateOrders', count(*) filter(where ready_on is null),
          'medianWaitDays', round((percentile_cont(0.5) within group(order by v_today - ready_on))::numeric, 2),
          'oldestWaitDays', max(v_today - ready_on)) from open_orders where status = 'listo_para_retirar')
      ),
      'periodFlow', jsonb_build_object(
        'intakes', (select coalesce(sum(n), 0) from daily_intakes),
        'closures', (select coalesce(sum(n), 0) from daily_closures),
        'closuresMissingDate', (select count(*) from enriched where not is_open and closed_on is null),
        'days', (select coalesce(jsonb_agg(jsonb_build_object('date', d.day::date,
          'intakes', coalesce(i.n, 0), 'closures', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
          from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d(day)
          left join daily_intakes i on i.day = d.day::date left join daily_closures c on c.day = d.day::date)
      ),
      'warranty', jsonb_build_object(
        'activeReturns', (select count(*) from public.repair_warranty_returns where closed_at is null),
        'openedInPeriod', (select count(*) from public.repair_warranty_returns where received_on between v_from and least(v_to, v_today)),
        'closedInPeriod', (select count(*) from public.repair_warranty_returns where closed_at >= v_start and closed_at < v_end and closed_at <= v_now),
        'uniqueOrdersInPeriod', (select count(distinct order_id) from public.repair_warranty_returns where received_on between v_from and least(v_to, v_today)),
        'matureCohort', (select jsonb_build_object(
          'maturedOrders', count(*),
          'returnedOrders', count(*) filter(where has_return and not inconsistent_coverage),
          'comparableOrders', case when v_observation_from is null then null else count(*) filter(where not inconsistent_coverage) end,
          'returnRate', case when v_observation_from is not null
            then round(100.0 * count(*) filter(where has_return and not inconsistent_coverage)
              / nullif(count(*) filter(where not inconsistent_coverage), 0), 2) end,
          'reason', nullif(concat_ws(' ', case when v_observation_from is null then
            'No hay inicio verificado de observacion continua de reingresos. Se muestran casos registrados, no una tasa comparable.'
            when count(*) filter(where not inconsistent_coverage) = 0 then 'Todavia no hay garantias completamente observadas y vencidas comparables en este periodo.' end,
            case when count(*) filter(where inconsistent_coverage) > 0 then
              count(*) filter(where inconsistent_coverage)::text || ' ordenes excluidas por cobertura corregida o snapshots incompletos. Sus reingresos se conservan en el historial.' end), '')
        ) from mature_returns)
      ),
      'phaseDurations', (select coalesce(jsonb_agg(to_jsonb(p) order by status), '[]'::jsonb) from phase_rows p),
      'quality', jsonb_build_object(
        'reconstructedStatusEvents', (select count(*) from history_base where is_reconstructed),
        'ambiguousStatusEvents', (select count(*) from history_base where same_time_count > 1),
        'invalidStatusIntervals', (select count(*) from intervals where is_valid is not true)
      ),
      'methodology', jsonb_build_object('warrantyObservationFrom', v_observation_from)
    )
  );
end;
$$;

create or replace function public.get_workshop_operational_metrics(p_from date default null, p_to date default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_workshop_operational_metrics(p_from, p_to);
$$;

revoke all on function private.get_workshop_operational_metrics(date, date),
  public.get_workshop_operational_metrics(date, date) from public, anon, authenticated, service_role;
grant execute on function private.get_workshop_operational_metrics(date, date),
  public.get_workshop_operational_metrics(date, date) to authenticated;


notify pgrst,'reload schema';
commit;
