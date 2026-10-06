do $$
begin
  if exists (
    select 1
    from public.movimientos_caja
    where tipo in ('ajuste_ingreso', 'ajuste_egreso')
  ) then
    raise exception 'No se puede quitar ajuste de caja: todavia existen movimientos ajuste.';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'movimientos_caja_tipo_check'
      and conrelid = 'public.movimientos_caja'::regclass
  ) then
    alter table public.movimientos_caja drop constraint movimientos_caja_tipo_check;
  end if;
end $$;

alter table public.movimientos_caja
add constraint movimientos_caja_tipo_check
check (
  tipo in (
    'venta',
    'reparacion',
    'gasto',
    'facturacion',
    'sueldo'
  )
);

create or replace function public.resumen_caja_diario(p_fecha date default current_date)
returns table (
  ingresos numeric,
  egresos numeric,
  ganancia_real numeric
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(case when tipo in ('venta', 'reparacion', 'facturacion') then monto else 0 end), 0)::numeric as ingresos,
    coalesce(sum(case when tipo = 'gasto' then monto else 0 end), 0)::numeric as egresos,
    (
      coalesce(sum(case when tipo in ('venta', 'reparacion', 'facturacion') then monto else 0 end), 0) -
      coalesce(sum(case when tipo = 'gasto' then monto else 0 end), 0)
    )::numeric as ganancia_real
  from public.movimientos_caja
  where fecha::date = p_fecha;
$$;
