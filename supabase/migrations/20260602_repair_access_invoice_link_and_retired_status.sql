alter table public.repairs
  add column if not exists repair_access_order_id uuid references public.repair_access_orders(id) on delete set null;

create index if not exists repairs_repair_access_order_idx
  on public.repairs (repair_access_order_id);

alter table public.repair_access_orders
  drop constraint if exists repair_access_orders_status_check;

update public.repair_access_orders
set status = case status
  when 'comprado' then 'retirado'
  when 'entregado' then 'retirado'
  when 'cobrado' then 'retirado'
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
        'retirado',
        'sin_solucion'
      )
    );

alter table public.repair_access_status_history
  drop constraint if exists repair_access_status_history_next_status_check;

update public.repair_access_status_history
set previous_status = case previous_status
    when 'comprado' then 'retirado'
    when 'entregado' then 'retirado'
    when 'cobrado' then 'retirado'
    else previous_status
  end,
  next_status = case next_status
    when 'comprado' then 'retirado'
    when 'entregado' then 'retirado'
    when 'cobrado' then 'retirado'
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
        'retirado',
        'sin_solucion'
      )
    );
