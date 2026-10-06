-- Consolidated read models for the two most request-heavy administrative pages.
-- Both functions remain SECURITY INVOKER so table RLS continues to apply.

create or replace function public.get_cash_page_snapshot(
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
begin
  if auth.role() <> 'service_role'
     and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'No tenes permiso para consultar caja.' using errcode = '42501';
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
    with scoped_movements as materialized (
      select
        id,
        tipo,
        monto,
        medio_pago,
        descripcion,
        referencia_tabla,
        referencia_id,
        fecha
      from public.movimientos_caja
      where fecha >= v_cutoff
    ),
    summary_rows as (
      select
        medio_pago,
        coalesce(sum(monto) filter (where tipo in ('venta', 'reparacion', 'facturacion')), 0)::numeric as total_income,
        coalesce(sum(monto) filter (where tipo in ('gasto', 'sueldo')), 0)::numeric as total_outcome,
        coalesce(sum(monto) filter (where tipo = 'venta' and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_sales,
        coalesce(sum(monto) filter (where tipo = 'reparacion' and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_repairs,
        coalesce(sum(monto) filter (where tipo = 'gasto' and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_expenses,
        coalesce(sum(monto) filter (where tipo = 'facturacion' and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_invoices,
        coalesce(sum(monto) filter (where tipo = 'sueldo' and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_salaries,
        coalesce(sum(monto) filter (where tipo in ('venta', 'reparacion', 'facturacion') and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_income,
        coalesce(sum(monto) filter (where tipo in ('gasto', 'sueldo') and fecha >= p_day_start and fecha < p_day_end), 0)::numeric as period_outcome
      from scoped_movements
      group by medio_pago
    ),
    recent_rows as (
      select *
      from scoped_movements
      order by fecha desc, id desc
      limit 80
    ),
    closure_rows as (
      select id, fecha, saldo_inicial, ingresos, egresos, saldo_final, observaciones
      from public.cierres_caja
      order by fecha desc, created_at desc
      limit 20
    )
    select jsonb_build_object(
      'cash_summary', coalesce(
        (select jsonb_agg(to_jsonb(summary_rows) order by medio_pago) from summary_rows),
        '[]'::jsonb
      ),
      'recent_movements', coalesce(
        (select jsonb_agg(to_jsonb(recent_rows) order by fecha desc, id desc) from recent_rows),
        '[]'::jsonb
      ),
      'closures', coalesce(
        (select jsonb_agg(to_jsonb(closure_rows) order by fecha desc) from closure_rows),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.get_cash_page_snapshot(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_cash_page_snapshot(timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.get_reports_performance_snapshot(
  p_selected_start date,
  p_selected_end date,
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role'
     and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'No tenes permiso para consultar reportes.' using errcode = '42501';
  end if;

  return (
    with periods(period_key, date_start, date_end, ts_start, ts_end) as (
      values
        (
          'selected'::text,
          p_selected_start,
          p_selected_end,
          p_selected_start::timestamp at time zone 'America/Argentina/Buenos_Aires',
          p_selected_end::timestamp at time zone 'America/Argentina/Buenos_Aires'
        ),
        (
          'current'::text,
          p_current_start,
          p_current_end,
          p_current_start::timestamp at time zone 'America/Argentina/Buenos_Aires',
          p_current_end::timestamp at time zone 'America/Argentina/Buenos_Aires'
        ),
        (
          'previous'::text,
          p_previous_start,
          p_previous_end,
          p_previous_start::timestamp at time zone 'America/Argentina/Buenos_Aires',
          p_previous_end::timestamp at time zone 'America/Argentina/Buenos_Aires'
        )
    ),
    sales_metrics as (
      select
        period_key,
        coalesce(sum(s.subtotal), 0)::numeric as sales_total,
        coalesce(sum(s.profit_total), 0)::numeric as sales_profit
      from periods
      left join public.sales s on s.sold_at >= ts_start and s.sold_at < ts_end
      group by period_key
    ),
    repair_metrics as (
      select
        period_key,
        coalesce(sum(coalesce(r.final_price, r.estimated_price, 0)), 0)::numeric as repairs_total
      from periods
      left join public.repairs r on r.entry_date >= date_start and r.entry_date < date_end
      group by period_key
    ),
    expense_metrics as (
      select
        period_key,
        coalesce(sum(e.amount) filter (where e.is_voided is not true), 0)::numeric as expenses_total
      from periods
      left join public.expenses e on e.expense_date >= date_start and e.expense_date < date_end
      group by period_key
    ),
    invoice_metrics as (
      select
        period_key,
        coalesce(sum(i.total) filter (where i.status is distinct from 'anulado'), 0)::numeric as invoices_total
      from periods
      left join public.invoices i on i.created_at >= ts_start and i.created_at < ts_end
      group by period_key
    ),
    salary_metrics as (
      select
        period_key,
        coalesce(sum(sw.amount), 0)::numeric as salaries_total
      from periods
      left join public.salary_withdrawals sw
        on sw.withdrawal_date >= date_start and sw.withdrawal_date < date_end
      group by period_key
    ),
    cash_metrics as (
      select
        period_key,
        (
          coalesce(sum(m.monto) filter (where m.tipo in ('venta', 'reparacion', 'facturacion')), 0)
          - coalesce(sum(m.monto) filter (where m.tipo in ('gasto', 'sueldo')), 0)
        )::numeric as net_cash
      from periods
      left join public.movimientos_caja m on m.fecha >= ts_start and m.fecha < ts_end
      group by period_key
    ),
    metrics_rows as (
      select
        p.period_key,
        jsonb_build_object(
          'sales_total', sm.sales_total,
          'sales_profit', sm.sales_profit,
          'repairs_total', rm.repairs_total,
          'expenses_total', em.expenses_total,
          'invoices_total', im.invoices_total,
          'salaries_total', swm.salaries_total,
          'net_cash', cm.net_cash
        ) as payload
      from periods p
      join sales_metrics sm using (period_key)
      join repair_metrics rm using (period_key)
      join expense_metrics em using (period_key)
      join invoice_metrics im using (period_key)
      join salary_metrics swm using (period_key)
      join cash_metrics cm using (period_key)
    ),
    product_rankings as (
      select
        coalesce(p.name, 'Producto sin nombre') as label,
        coalesce(sum(si.quantity), 0)::numeric as quantity,
        coalesce(sum(si.total), 0)::numeric as revenue,
        coalesce(sum(si.total - (si.unit_cost * si.quantity)), 0)::numeric as profit
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      left join public.products p on p.id = si.product_id
      where s.sold_at >= (p_selected_start::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and s.sold_at < (p_selected_end::timestamp at time zone 'America/Argentina/Buenos_Aires')
      group by coalesce(p.name, 'Producto sin nombre')
      order by revenue desc
      limit 8
    ),
    category_rankings as (
      select
        coalesce(c.name, 'Sin categoria') as label,
        coalesce(sum(si.quantity), 0)::numeric as quantity,
        coalesce(sum(si.total), 0)::numeric as revenue,
        coalesce(sum(si.total - (si.unit_cost * si.quantity)), 0)::numeric as profit
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      left join public.products p on p.id = si.product_id
      left join public.categories c on c.id = p.category_id
      where s.sold_at >= (p_selected_start::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and s.sold_at < (p_selected_end::timestamp at time zone 'America/Argentina/Buenos_Aires')
      group by coalesce(c.name, 'Sin categoria')
      order by revenue desc
      limit 8
    ),
    seller_rows as (
      select
        s.created_by as user_id,
        case
          when s.created_by is null then 'Sin asignar'
          else coalesce(pr.full_name, 'Usuario')
        end as label,
        coalesce(sum(s.subtotal), 0)::numeric as total,
        count(*)::bigint as count
      from public.sales s
      left join public.profiles pr on pr.id = s.created_by
      where s.sold_at >= (p_selected_start::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and s.sold_at < (p_selected_end::timestamp at time zone 'America/Argentina/Buenos_Aires')
      group by s.created_by, pr.full_name
      order by total desc
    ),
    technician_rows as (
      select
        r.created_by as user_id,
        case
          when r.created_by is null then 'Sin asignar'
          else coalesce(pr.full_name, 'Usuario')
        end as label,
        coalesce(sum(coalesce(r.final_price, r.estimated_price, 0)), 0)::numeric as total,
        count(*)::bigint as count
      from public.repairs r
      left join public.profiles pr on pr.id = r.created_by
      where r.entry_date >= p_selected_start and r.entry_date < p_selected_end
      group by r.created_by, pr.full_name
      order by total desc
    )
    select jsonb_build_object(
      'metrics', coalesce(
        (select jsonb_object_agg(period_key, payload) from metrics_rows),
        '{}'::jsonb
      ),
      'rankings', jsonb_build_object(
        'products', coalesce((select jsonb_agg(to_jsonb(product_rankings) order by revenue desc) from product_rankings), '[]'::jsonb),
        'categories', coalesce((select jsonb_agg(to_jsonb(category_rankings) order by revenue desc) from category_rankings), '[]'::jsonb)
      ),
      'seller_summary', coalesce(
        (select jsonb_agg(to_jsonb(seller_rows) order by total desc) from seller_rows),
        '[]'::jsonb
      ),
      'technician_summary', coalesce(
        (select jsonb_agg(to_jsonb(technician_rows) order by total desc) from technician_rows),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.get_reports_performance_snapshot(date, date, date, date, date, date) from public, anon;
grant execute on function public.get_reports_performance_snapshot(date, date, date, date, date, date) to authenticated, service_role;
