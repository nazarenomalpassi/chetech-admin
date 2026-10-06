create or replace function public.get_technician_repair_dashboard_orders()
returns table(payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_access_operations() then
    raise exception 'Acceso no autorizado';
  end if;

  return query
  select jsonb_build_object(
    'id', o.id,
    'repair_number', o.repair_number,
    'intake_date', o.intake_date,
    'issue_reported', o.issue_reported,
    'status', o.status,
    'technician_id', o.technician_id,
    'repair_access_customers', case
      when c.id is null then null
      else jsonb_build_object('full_name', c.full_name)
    end,
    'repair_access_devices', case
      when d.id is null then null
      else jsonb_build_object(
        'device_type', d.device_type,
        'brand', d.brand,
        'model', d.model
      )
    end
  )
  from public.repair_access_orders o
  left join public.repair_access_customers c on c.id = o.customer_id
  left join public.repair_access_devices d on d.id = o.device_id
  order by o.intake_date desc, o.created_at desc;
end;
$$;

revoke all on function public.get_technician_repair_dashboard_orders() from public, anon;
grant execute on function public.get_technician_repair_dashboard_orders() to authenticated;
