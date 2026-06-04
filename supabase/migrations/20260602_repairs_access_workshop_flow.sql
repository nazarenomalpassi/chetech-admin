create sequence if not exists public.repair_access_order_number_seq
  as integer
  start with 1
  increment by 1
  minvalue 1;

alter table public.repair_access_orders
  add column if not exists repair_progress text,
  add column if not exists budget_detail text,
  add column if not exists budget_response_notes text,
  add column if not exists budget_response_at timestamptz,
  add column if not exists technician_name text;

create index if not exists repair_access_orders_repair_number_search_idx
  on public.repair_access_orders (repair_number);

do $$
declare
  max_number integer;
begin
  select coalesce(max(substring(repair_number from '(\d+)$')::integer), 0)
    into max_number
  from public.repair_access_orders
  where repair_number is not null
    and repair_number ~ '\d+$';

  if max_number > 0 then
    perform setval('public.repair_access_order_number_seq', max_number, true);
  end if;
end $$;

update public.repair_access_orders
set repair_number = 'REP-' || lpad(nextval('public.repair_access_order_number_seq')::text, 6, '0')
where repair_number is null
   or btrim(repair_number) = '';

create or replace function public.generate_repair_access_number()
returns text
language sql
as $$
  select 'REP-' || lpad(nextval('public.repair_access_order_number_seq')::text, 6, '0');
$$;

grant usage, select on sequence public.repair_access_order_number_seq to authenticated, service_role;
grant execute on function public.generate_repair_access_number() to authenticated, service_role;

alter table public.repair_access_orders
  drop constraint if exists repair_access_orders_status_check;

update public.repair_access_orders
set status = case status
  when 'ingresado' then 'pendiente_revision'
  when 'esperando_confirmacion_cliente' then 'presupuestado'
  when 'aprobado_por_cliente' then 'presupuestado_aceptado'
  when 'aprobado' then 'presupuestado_aceptado'
  when 'rechazado_por_cliente' then 'presupuestado_rechazado'
  when 'rechazado' then 'presupuestado_rechazado'
  when 'en_reparacion' then 'en_revision'
  when 'esperando_repuesto' then 'en_revision'
  when 'terminado' then 'listo_para_retirar'
  when 'entregado' then 'comprado'
  when 'cobrado' then 'comprado'
  when 'cancelado' then 'sin_solucion'
  when 'dado_de_baja' then 'sin_solucion'
  else status
end;

alter table public.repair_access_orders
  add constraint repair_access_orders_status_check
    check (
      status in (
        'pendiente_revision',
        'en_revision',
        'presupuestado',
        'presupuestado_aceptado',
        'presupuestado_rechazado',
        'listo_para_retirar',
        'comprado',
        'sin_solucion'
      )
    );

alter table public.repair_access_status_history
  drop constraint if exists repair_access_status_history_next_status_check;

update public.repair_access_status_history
set previous_status = case previous_status
    when 'ingresado' then 'pendiente_revision'
    when 'esperando_confirmacion_cliente' then 'presupuestado'
    when 'aprobado_por_cliente' then 'presupuestado_aceptado'
    when 'aprobado' then 'presupuestado_aceptado'
    when 'rechazado_por_cliente' then 'presupuestado_rechazado'
    when 'rechazado' then 'presupuestado_rechazado'
    when 'en_reparacion' then 'en_revision'
    when 'esperando_repuesto' then 'en_revision'
    when 'terminado' then 'listo_para_retirar'
    when 'entregado' then 'comprado'
    when 'cobrado' then 'comprado'
    when 'cancelado' then 'sin_solucion'
    when 'dado_de_baja' then 'sin_solucion'
    else previous_status
  end,
  next_status = case next_status
    when 'ingresado' then 'pendiente_revision'
    when 'esperando_confirmacion_cliente' then 'presupuestado'
    when 'aprobado_por_cliente' then 'presupuestado_aceptado'
    when 'aprobado' then 'presupuestado_aceptado'
    when 'rechazado_por_cliente' then 'presupuestado_rechazado'
    when 'rechazado' then 'presupuestado_rechazado'
    when 'en_reparacion' then 'en_revision'
    when 'esperando_repuesto' then 'en_revision'
    when 'terminado' then 'listo_para_retirar'
    when 'entregado' then 'comprado'
    when 'cobrado' then 'comprado'
    when 'cancelado' then 'sin_solucion'
    when 'dado_de_baja' then 'sin_solucion'
    else next_status
  end;

alter table public.repair_access_status_history
  add constraint repair_access_status_history_next_status_check
    check (
      next_status in (
        'pendiente_revision',
        'en_revision',
        'presupuestado',
        'presupuestado_aceptado',
        'presupuestado_rechazado',
        'listo_para_retirar',
        'comprado',
        'sin_solucion'
      )
    );
