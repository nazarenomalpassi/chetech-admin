-- Inicio "Hoy en el taller": conteos por etapa y equipos listos que esperan retiro.
-- Solo lectura y aditiva. Sigue el patrón de las demás lecturas del taller: la función
-- privada valida el acceso y la pública la expone con los permisos de quien llama.
begin;

create or replace function private.get_workshop_today()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null or (select private.can_access_operations()) is not true then
    raise exception 'Sin permiso para consultar el taller.' using errcode = '42501';
  end if;

  return (
    with open_orders as materialized (
      select o.id, o.repair_number, o.status, o.intake_date, o.imported_at,
        o.budget_amount, o.final_amount, o.customer_id, o.device_id
      from public.repair_access_orders o
      where o.status <> 'retirado' and o.delivered_at is null and o.picked_up_at is null
    ), ready as materialized (
      -- Fecha en que pasó a "listo" según el historial real; las importadas no la tienen.
      select o.*, (
        select (h.changed_at at time zone 'America/Argentina/Buenos_Aires')::date
        from public.repair_access_status_history h
        where h.repair_order_id = o.id and h.next_status = 'listo_para_retirar'
          and coalesce(h.notes, '') <> 'Estado reconstruido durante la importacion historica.'
          and (o.imported_at is null or h.changed_at > o.imported_at)
        order by h.changed_at desc, h.id desc
        limit 1
      ) as ready_on
      from open_orders o
      where o.status = 'listo_para_retirar'
    ), oldest_ready as (
      select r.id, r.repair_number, r.intake_date, r.ready_on, r.budget_amount, r.final_amount,
        c.full_name, c.phone, d.device_type, d.brand, d.model
      from ready r
      join public.repair_access_customers c on c.id = r.customer_id
      join public.repair_access_devices d on d.id = r.device_id
      order by coalesce(r.ready_on, r.intake_date), r.intake_date, r.repair_number
      limit 8
    )
    select jsonb_build_object(
      'asOf', v_today,
      'stages', jsonb_build_object(
        'review', count(*) filter (where status in ('pendiente_revision', 'en_revision')),
        'waitingCustomer', count(*) filter (where status = 'presupuestado'),
        'inProgress', count(*) filter (
          where status in ('presupuestado_aceptado', 'en_reparacion', 'en_pruebas')),
        'ready', count(*) filter (where status = 'listo_para_retirar'),
        'toReturn', count(*) filter (
          where status in ('sin_solucion', 'presupuestado_rechazado', 'no_presenta_fallas'))
      ),
      'attention', jsonb_build_object(
        'open', count(*),
        'over30Days', count(*) filter (where intake_date < v_today - 30),
        'blockedParts', (
          select count(distinct p.order_id)
          from public.repair_part_requests p
          join open_orders x on x.id = p.order_id
          where p.status not in ('cancelled', 'installed') and p.received_quantity < p.quantity
        )
      ),
      'oldestReady', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'repairNumber', t.repair_number,
          'intakeDate', t.intake_date,
          'readyOn', t.ready_on,
          'budgetAmount', coalesce(t.budget_amount, 0),
          'finalAmount', coalesce(t.final_amount, 0),
          'customerName', t.full_name,
          'phone', coalesce(t.phone, ''),
          'device', concat_ws(' ', t.device_type, t.brand, t.model)
        ) order by coalesce(t.ready_on, t.intake_date), t.intake_date, t.repair_number), '[]'::jsonb)
        from oldest_ready t
      )
    )
    from open_orders
  );
end;
$$;

create or replace function public.get_workshop_today()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_workshop_today();
$$;

revoke all on function private.get_workshop_today(), public.get_workshop_today()
  from public, anon, authenticated, service_role;
grant execute on function private.get_workshop_today(), public.get_workshop_today()
  to authenticated;

notify pgrst, 'reload schema';
commit;
