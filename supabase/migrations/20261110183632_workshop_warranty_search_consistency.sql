begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function private.workshop_normalize_lookup(value text) returns text language sql immutable parallel safe set search_path='' as $$
  select lower(trim(regexp_replace(regexp_replace(regexp_replace(normalize(coalesce(value,''),NFD),U&'[\0300-\036f]','','g'),'[^0-9 a-zA-Z]+',' ','g'),'\s+',' ','g')))
$$;
revoke all on function private.workshop_normalize_lookup(text) from public,anon,authenticated;

create or replace function private.workshop_read_page(p_search text default '',p_status text default 'todos',p_warranty text default 'todos',p_scope text default 'all',p_cursor_date timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_rows jsonb; v_total integer; v_summary jsonb; v_ids uuid[];
  v_admin boolean := (select private.is_admin());
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_collected numeric := 0; v_payment_orders bigint := 0; v_collected_today bigint := 0;
  v_search text := private.workshop_normalize_lookup(left(trim(p_search),200));
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para consultar ordenes.' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('all','mine','unassigned','parts','ready','return','waiting_customer','approved','overdue') then raise exception 'El filtro de trabajo no es valido.' using errcode='23514'; end if;
  with filtered as (
    select o.id,o.created_at from public.repair_access_orders o
    join public.repair_access_customers c on c.id=o.customer_id join public.repair_access_devices d on d.id=o.device_id
    left join lateral (select r.* from public.repair_warranty_returns r where r.order_id=o.id and r.closed_at is null order by r.created_at desc,r.id desc limit 1) w on true
    cross join lateral (select coalesce(w.status,o.status) status,(w.id is not null or (o.delivered_at is null and o.picked_up_at is null and o.status<>'retirado')) is_open) current
    where (p_status='todos' or current.status=p_status)
      and (p_warranty='todos' or (p_warranty='active' and o.has_warranty and o.warranty_until>=v_today) or (p_warranty='expired' and o.has_warranty and o.warranty_until<v_today) or (p_warranty='none' and not o.has_warranty) or (p_warranty='needs_review' and o.warranty_requires_review) or (p_warranty='pending_delivery' and current.is_open))
      and (v_search='' or strpos(private.workshop_normalize_lookup(concat_ws(' ',o.repair_number,o.legacy_order_number,c.full_name,c.phone,c.alternate_phone,case when v_admin then c.dni end,d.device_type,d.brand,d.model,d.serial_number,o.issue_reported,o.technical_diagnosis,o.budget_detail,o.repair_progress,o.status,
        w.issue_reported,w.progress,w.resolution,current.status,
        case current.status when 'pendiente_revision' then 'Pendiente de revision' when 'presupuestado_aceptado' then 'Presupuestado y aceptado' when 'presupuestado_rechazado' then 'Presupuestado y rechazado' when 'retirado' then 'Retirado por cliente' else current.status end,
        case o.status when 'pendiente_revision' then 'Pendiente de revision' when 'presupuestado_aceptado' then 'Presupuestado y aceptado' when 'presupuestado_rechazado' then 'Presupuestado y rechazado' when 'retirado' then 'Retirado por cliente' else o.status end)),v_search)>0)
      and (p_scope='all' or (p_scope='mine' and o.technician_id=auth.uid() and current.is_open) or (p_scope='unassigned' and o.technician_id is null and current.is_open)
        or (p_scope='ready' and current.status='listo_para_retirar' and current.is_open)
        or (p_scope='return' and current.status in ('sin_solucion','presupuestado_rechazado','no_presenta_fallas') and current.is_open)
        or (p_scope='waiting_customer' and w.id is null and o.status='presupuestado' and current.is_open)
        or (p_scope='approved' and w.id is null and (o.approval_status='accepted' or o.status='presupuestado_aceptado') and current.is_open)
        or (p_scope='overdue' and current.is_open and case when w.id is not null then w.received_on+7 else coalesce(o.next_action_date,o.intake_date+7) end<v_today)
        or (p_scope='parts' and current.is_open and exists(select 1 from public.repair_part_requests r where r.order_id=o.id and r.status not in ('cancelled','installed') and r.received_quantity<r.quantity)))
  ) select count(*),array(select id from filtered where p_cursor_date is null or (created_at,id)<(p_cursor_date,p_cursor_id) order by created_at desc,id desc limit least(50,greatest(1,p_limit))) into v_total,v_ids from filtered;
  select coalesce(jsonb_agg(private.workshop_order_payload(o.id) order by o.created_at desc,o.id desc),'[]'::jsonb) into v_rows from public.repair_access_orders o where o.id=any(v_ids);
  -- Existing financial summary is unchanged: native and legacy payments once.
  if v_admin then
    with payment_rows as (
      select p.repair_order_id as order_id,p.amount,p.payment_date
      from public.repair_access_payments p join public.repair_access_orders o on o.id=p.repair_order_id
      where p.voided_at is null and p.legacy_repair_payment_id is null
      union all
      select r.repair_access_order_id,p.amount,p.payment_date from public.repair_payments p join public.repairs r on r.id=p.repair_id join public.repair_access_orders o on o.id=r.repair_access_order_id
    ), per_order as (
      select order_id,sum(amount) as collected,coalesce(sum(amount) filter(where payment_date=v_today),0) as collected_today from payment_rows group by order_id
    ) select coalesce(sum(collected),0),count(*) filter(where collected>0),count(*) filter(where collected_today>0) into v_collected,v_payment_orders,v_collected_today from per_order;
  end if;
  select jsonb_build_object(
    'totalOrders',count(*),'totalCustomers',(select count(*) from public.repair_access_customers),
    'activeOrders',count(*) filter(where delivered_at is null and status<>'retirado'),'paidOrders',v_payment_orders,
    'pendingBudget',count(*) filter(where status in ('pendiente_revision','en_revision')),
    'totalProjected',case when v_admin then coalesce(sum(coalesce(nullif(final_amount,0),budget_amount,0)),0) else 0 end,
    'totalCollected',v_collected,
    'intakeToday',count(*) filter(where intake_date=v_today),'deliveredToday',count(*) filter(where (delivered_at at time zone 'America/Argentina/Buenos_Aires')::date=v_today),
    'collectedToday',v_collected_today,
    'readyToPickup',count(*) filter(where status='listo_para_retirar' and delivered_at is null),'waitingCustomer',count(*) filter(where status='presupuestado'),
    'delayedOrders',count(*) filter(where delivered_at is null and status<>'retirado' and intake_date<v_today-7),
    'activeWarranties',count(*) filter(where has_warranty and warranty_until>=v_today),
    'statusCounts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from public.repair_access_orders group by status) s)
  ) into v_summary from public.repair_access_orders;
  return jsonb_build_object('orders',v_rows,'total',v_total,'summary',v_summary,'pageSize',least(50,greatest(1,p_limit)), 'nextCursor',case when cardinality(v_ids)=least(50,greatest(1,p_limit)) then (select jsonb_build_object('date',created_at,'id',id) from public.repair_access_orders where id=any(v_ids) order by created_at,id limit 1) else null end);
end $$;
comment on function private.workshop_read_page(text,text,text,text,timestamptz,uuid,integer) is
  'Current active warranty visit participates in state/search/custody filters. REP chronology and financial summary are unchanged. Search normalization matches the local cards.';
notify pgrst,'reload schema';
commit;
