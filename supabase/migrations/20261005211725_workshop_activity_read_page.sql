begin;

create index if not exists workshop_events_order_cursor_idx
  on public.workshop_events(order_id, created_at desc, id desc);

create or replace function private.get_workshop_activity_page(
  p_order_id uuid,
  p_cursor_date timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := least(30, p_limit);
  v_result jsonb;
begin
  if auth.uid() is null or (select private.can_access_operations()) is not true then
    raise exception 'Sin permiso para consultar el taller.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_order_id is null
    or (p_cursor_date is null) <> (p_cursor_id is null)
    or (p_cursor_date is not null and not isfinite(p_cursor_date)) then
    raise exception 'Pagina de historial no valida.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.repair_access_orders where id = p_order_id) then
    raise exception 'Orden no disponible.' using errcode = 'P0002';
  end if;
  if p_cursor_id is not null and not exists(
    select 1 from public.workshop_events
    where order_id = p_order_id and id = p_cursor_id and created_at = p_cursor_date
  ) then
    raise exception 'Cursor de historial no valido.' using errcode = '22023';
  end if;

  -- One look-ahead row detects older history without a full-history count/scan.
  with window_rows as materialized (
    select e.id, e.kind, e.message, e.actor_id, e.created_at
    from public.workshop_events e
    where e.order_id = p_order_id
      and (p_cursor_date is null or (e.created_at, e.id) < (p_cursor_date, p_cursor_id))
    order by e.created_at desc, e.id desc
    limit v_limit + 1
  ), page as (
    select * from window_rows order by created_at desc, id desc limit v_limit
  )
  select jsonb_build_object(
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'message', e.message,
      'actorName', coalesce(nullif(btrim(p.full_name), ''), 'Sistema'),
      'createdAt', e.created_at
    ) order by e.created_at desc, e.id desc), '[]'::jsonb)
      from page e left join public.profiles p on p.id = e.actor_id),
    'nextCursor', case when (select count(*) from window_rows) > v_limit then
      (select jsonb_build_object('date', created_at, 'id', id)
        from page order by created_at, id limit 1)
      else null end
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_workshop_activity_page(
  p_order_id uuid,
  p_cursor_date timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.get_workshop_activity_page(p_order_id, p_cursor_date, p_cursor_id, p_limit);
$$;

revoke all on function private.get_workshop_activity_page(uuid,timestamptz,uuid,integer) from public, anon;
revoke all on function public.get_workshop_activity_page(uuid,timestamptz,uuid,integer) from public, anon;
grant execute on function private.get_workshop_activity_page(uuid,timestamptz,uuid,integer) to authenticated, service_role;
grant execute on function public.get_workshop_activity_page(uuid,timestamptz,uuid,integer) to authenticated, service_role;

commit;
