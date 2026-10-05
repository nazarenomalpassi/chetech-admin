begin;
create or replace function private.workshop_order_payload(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_payload jsonb;
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para consultar ordenes.' using errcode='42501'; end if;
  if not (select private.is_admin()) then
    select payload into v_payload from public.get_technician_repair_orders(p_order_id);
    return v_payload;
  end if;
  select to_jsonb(o)||jsonb_build_object('repair_access_customers',to_jsonb(c),'repair_access_devices',to_jsonb(d),'storefront_customer',case when p.id is null then null else jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'phone',p.phone) end)
  into v_payload from public.repair_access_orders o join public.repair_access_customers c on c.id=o.customer_id join public.repair_access_devices d on d.id=o.device_id left join public.profiles p on p.id=o.customer_user_id where o.id=p_order_id;
  return v_payload;
end $$;
create or replace function public.workshop_order_payload(p_order_id uuid) returns jsonb language sql stable set search_path='' as $$ select private.workshop_order_payload(p_order_id) $$;

create or replace function private.workshop_read_page(p_search text default '',p_status text default 'todos',p_warranty text default 'todos',p_scope text default 'all',p_cursor_date timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb; v_total integer; v_summary jsonb; v_ids uuid[]; v_admin boolean := (select private.is_admin()); v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para consultar ordenes.' using errcode='42501'; end if;
  if p_scope not in ('all','mine','unassigned','parts','ready','return','waiting_customer','approved','overdue') then raise exception 'El filtro de trabajo no es valido.' using errcode='23514'; end if;
  with filtered as (
    select o.id,o.created_at from public.repair_access_orders o join public.repair_access_customers c on c.id=o.customer_id join public.repair_access_devices d on d.id=o.device_id
    where (p_status='todos' or o.status=p_status)
      and (p_warranty='todos' or (p_warranty='active' and o.has_warranty and o.warranty_until>=v_today) or (p_warranty='expired' and o.has_warranty and o.warranty_until<v_today) or (p_warranty='none' and not o.has_warranty) or (p_warranty='needs_review' and o.warranty_requires_review) or (p_warranty='pending_delivery' and o.delivered_at is null))
      and (coalesce(trim(p_search),'')='' or position(lower(left(trim(p_search),200)) in lower(concat_ws(' ',o.repair_number,o.legacy_order_number,c.full_name,c.phone,c.alternate_phone,d.device_type,d.brand,d.model,d.serial_number,o.issue_reported,o.technical_diagnosis,o.budget_detail,o.status)))>0)
      and (p_scope='all' or (p_scope='mine' and o.technician_id=auth.uid() and o.delivered_at is null) or (p_scope='unassigned' and o.technician_id is null and o.delivered_at is null and o.status<>'retirado') or (p_scope='ready' and o.status='listo_para_retirar' and o.delivered_at is null) or (p_scope='return' and o.status in ('sin_solucion','presupuestado_rechazado') and o.delivered_at is null) or (p_scope='waiting_customer' and o.status='presupuestado') or (p_scope='approved' and (o.approval_status='accepted' or o.status='presupuestado_aceptado') and o.delivered_at is null) or (p_scope='overdue' and o.delivered_at is null and coalesce(o.next_action_date,o.intake_date+7)<v_today) or (p_scope='parts' and exists(select 1 from public.repair_part_requests r where r.order_id=o.id and r.status not in ('cancelled','installed') and r.received_quantity<r.quantity)))
  ) select count(*),array(select id from filtered where p_cursor_date is null or (created_at,id)<(p_cursor_date,p_cursor_id) order by created_at desc,id desc limit least(50,greatest(1,p_limit))) into v_total,v_ids from filtered;
  select coalesce(jsonb_agg(private.workshop_order_payload(o.id) order by o.created_at desc,o.id desc),'[]'::jsonb) into v_rows from public.repair_access_orders o where o.id=any(v_ids);
  select jsonb_build_object(
    'totalOrders',count(*),'totalCustomers',(select count(*) from public.repair_access_customers),
    'activeOrders',count(*) filter(where delivered_at is null and status<>'retirado'),'paidOrders',case when v_admin then count(*) filter(where is_paid) else 0 end,
    'pendingBudget',count(*) filter(where status in ('pendiente_revision','en_revision')),
    'totalProjected',case when v_admin then coalesce(sum(coalesce(final_amount,budget_amount,0)),0) else 0 end,
    'totalCollected',case when v_admin then coalesce(sum(coalesce(final_amount,budget_amount,0)) filter(where is_paid),0) else 0 end,
    'intakeToday',count(*) filter(where intake_date=v_today),'deliveredToday',count(*) filter(where (delivered_at at time zone 'America/Argentina/Buenos_Aires')::date=v_today),
    'collectedToday',case when v_admin then count(*) filter(where (paid_at at time zone 'America/Argentina/Buenos_Aires')::date=v_today) else 0 end,
    'readyToPickup',count(*) filter(where status='listo_para_retirar' and delivered_at is null),'waitingCustomer',count(*) filter(where status='presupuestado'),
    'delayedOrders',count(*) filter(where delivered_at is null and status<>'retirado' and intake_date<v_today-7),
    'activeWarranties',count(*) filter(where has_warranty and warranty_until>=v_today),
    'statusCounts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from public.repair_access_orders group by status) s)
  ) into v_summary from public.repair_access_orders;
  return jsonb_build_object('orders',v_rows,'total',v_total,'summary',v_summary,'pageSize',least(50,greatest(1,p_limit)), 'nextCursor',case when cardinality(v_ids)=least(50,greatest(1,p_limit)) then (select jsonb_build_object('date',created_at,'id',id) from public.repair_access_orders where id=any(v_ids) order by created_at,id limit 1) else null end);
end $$;
create or replace function public.workshop_read_page(p_search text default '',p_status text default 'todos',p_warranty text default 'todos',p_scope text default 'all',p_cursor_date timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30) returns jsonb
language sql stable set search_path='' as $$ select private.workshop_read_page(p_search,p_status,p_warranty,p_scope,p_cursor_date,p_cursor_id,p_limit) $$;
create index if not exists workshop_orders_creation_idx on public.repair_access_orders(created_at desc,id desc);
create index if not exists workshop_orders_assigned_idx on public.repair_access_orders(technician_id,created_at desc,id desc) where delivered_at is null;
create index if not exists workshop_orders_due_idx on public.repair_access_orders(next_action_date) where delivered_at is null;
do $$ declare r record; begin
  for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('workshop_read_page','workshop_order_payload') loop
    execute 'REVOKE ALL ON FUNCTION '||r.signature||' FROM PUBLIC, anon';
    execute 'GRANT EXECUTE ON FUNCTION '||r.signature||' TO authenticated, service_role';
  end loop;
end $$;
commit;
