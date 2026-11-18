-- Inicio: ingresos y egresos de caja por día dentro del período elegido.
-- Solo lectura y aditiva. Misma base y corte que get_dashboard_cash_summary.
create or replace function public.get_dashboard_daily_cash(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  day date,
  income numeric,
  outcome numeric,
  sales numeric,
  repairs numeric,
  invoices numeric,
  expenses numeric,
  salaries numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (m.fecha at time zone 'America/Argentina/Buenos_Aires')::date as day,
    coalesce(sum(m.monto) filter (where m.tipo in ('venta', 'reparacion', 'facturacion')), 0)::numeric as income,
    coalesce(sum(m.monto) filter (where m.tipo in ('gasto', 'sueldo')), 0)::numeric as outcome,
    coalesce(sum(m.monto) filter (where m.tipo = 'venta'), 0)::numeric as sales,
    coalesce(sum(m.monto) filter (where m.tipo = 'reparacion'), 0)::numeric as repairs,
    coalesce(sum(m.monto) filter (where m.tipo = 'facturacion'), 0)::numeric as invoices,
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0)::numeric as expenses,
    coalesce(sum(m.monto) filter (where m.tipo = 'sueldo'), 0)::numeric as salaries
  from public.movimientos_caja m
  where m.fecha >= p_start
    and m.fecha < p_end
    and m.fecha >= coalesce(
      nullif((select value->>'movementCutoff' from public.app_settings where key = 'cash_runtime'), '')::timestamptz,
      '2026-04-16T14:21:01.222Z'::timestamptz
    )
  group by 1
  order by 1;
$$;

revoke all on function public.get_dashboard_daily_cash(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_dashboard_daily_cash(timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
