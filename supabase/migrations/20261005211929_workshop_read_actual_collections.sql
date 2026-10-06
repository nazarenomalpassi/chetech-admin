-- Follow-up read only. Keep the original page signature, payload, filters and
-- pagination. A payment flag, quote or invoice never substitutes an actual payment.
begin;
create or replace function private.workshop_read_page(p_search text default '',p_status text default 'todos',p_warranty text default 'todos',p_scope text default 'all',p_cursor_date timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_rows jsonb; v_total integer; v_summary jsonb; v_ids uuid[];
  v_admin boolean := (select private.is_admin());
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_collected numeric := 0; v_payment_orders bigint := 0; v_collected_today bigint := 0;
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

  -- Read financial sources only for admins. Native legacy mirrors are excluded;
  -- their canonical repair_payments row is counted once even if no mirror exists.
  if v_admin then
    with payment_rows as (
      select p.repair_order_id as order_id,p.amount,p.payment_date
      from public.repair_access_payments p join public.repair_access_orders o on o.id=p.repair_order_id
      where p.voided_at is null and p.legacy_repair_payment_id is null
      union all
      select r.repair_access_order_id,p.amount,p.payment_date
      from public.repair_payments p join public.repairs r on r.id=p.repair_id
      join public.repair_access_orders o on o.id=r.repair_access_order_id
    ), per_order as (
      select order_id,sum(amount) as collected,
        coalesce(sum(amount) filter(where payment_date=v_today),0) as collected_today
      from payment_rows group by order_id
    ) select coalesce(sum(collected),0),count(*) filter(where collected>0),count(*) filter(where collected_today>0)
      into v_collected,v_payment_orders,v_collected_today from per_order;
  end if;

  select jsonb_build_object(
    'totalOrders',count(*),'totalCustomers',(select count(*) from public.repair_access_customers),
    'activeOrders',count(*) filter(where delivered_at is null and status<>'retirado'),'paidOrders',v_payment_orders,
    'pendingBudget',count(*) filter(where status in ('pendiente_revision','en_revision')),
    'totalProjected',case when v_admin then coalesce(sum(coalesce(final_amount,budget_amount,0)),0) else 0 end,
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
-- CREATE OR REPLACE preserves the existing ACL; the public invoker wrapper stays unchanged.
comment on function private.workshop_read_page(text,text,text,text,timestamptz,uuid,integer) is
  'Same page contract. Admin collected totals use actual native plus legacy payments once. paidOrders means orders with positive recorded collections, including partials. collectedToday counts orders with positive collections on the operational payment date. Technician financial totals remain zero.';
commit;
