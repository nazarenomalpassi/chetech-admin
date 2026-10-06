-- Additive purchase metadata. No historical inference, cash rewrite or new ledger.
alter table public.expenses
  add column repair_order_id uuid references public.repair_access_orders(id),
  add column part_request_id uuid references public.repair_part_requests(id),
  add constraint expense_part_needs_order check(part_request_id is null or repair_order_id is not null);
create index expenses_part_request_idx on public.expenses(part_request_id) where part_request_id is not null;
create index expenses_repair_order_idx on public.expenses(repair_order_id) where repair_order_id is not null;

create function private.guard_expense_purchase_link() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.part_request_id is not null and not exists (
    select 1 from public.repair_part_requests p
    where p.id=new.part_request_id and p.order_id=new.repair_order_id and p.buyer_id is not null
  ) then
    raise exception 'Selecciona una compra de repuesto perteneciente a esta REP.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger expenses_purchase_link_guard before insert or update of part_request_id,repair_order_id
on public.expenses for each row execute function private.guard_expense_purchase_link();

create function private.link_expense_purchase_atomic(
  p_expense_id uuid,p_part_request_id uuid,p_repair_order_id uuid,
  p_expected_order_id uuid,p_expected_part_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expense public.expenses%rowtype; v_order uuid:=p_repair_order_id;
begin
  if not coalesce((select private.is_admin()),false) then
    raise exception 'Solo un administrador puede vincular gastos.' using errcode='42501';
  end if;
  select * into strict v_expense from public.expenses where id=p_expense_id for update;
  if p_part_request_id is not null then
    select order_id into strict v_order from public.repair_part_requests where id=p_part_request_id and buyer_id is not null;
    if p_repair_order_id is not null and p_repair_order_id<>v_order then
      raise exception 'El repuesto no pertenece a esta REP.' using errcode='23514';
    end if;
    if v_expense.is_voided or not v_expense.impacts_cash then
      raise exception 'Vincula como pago un gasto vigente que impacte caja.' using errcode='23514';
    end if;
  end if;
  if (v_expense.repair_order_id,v_expense.part_request_id) is not distinct from (v_order,p_part_request_id) then
    return jsonb_build_object('id',p_expense_id);
  end if;
  if (v_expense.repair_order_id,v_expense.part_request_id) is distinct from (p_expected_order_id,p_expected_part_id) then
    raise exception 'El vinculo cambio. Actualiza y revisa antes de guardar.' using errcode='40001';
  end if;
  update public.expenses set repair_order_id=v_order,part_request_id=p_part_request_id where id=p_expense_id;
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
  values('expenses',p_expense_id::text,'update',jsonb_build_object('link_only',true,
    'previous_order_id',v_expense.repair_order_id,'previous_part_id',v_expense.part_request_id,
    'repair_order_id',v_order,'part_request_id',p_part_request_id),auth.uid());
  return jsonb_build_object('id',p_expense_id);
end $$;
create function public.link_expense_purchase_atomic(
  p_expense_id uuid,p_part_request_id uuid,p_repair_order_id uuid,p_expected_order_id uuid,p_expected_part_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.link_expense_purchase_atomic(p_expense_id,p_part_request_id,p_repair_order_id,p_expected_order_id,p_expected_part_id)
$$;

-- Receipts provide durable retry identity only, never an accounting balance.
create table private.expense_operation_receipts (
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.expense_operation_receipts enable row level security;
revoke all on private.expense_operation_receipts from public,anon,authenticated;

create function private.save_expense_linked_atomic(p_operation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_receipt private.expense_operation_receipts%rowtype; v_result jsonb;
  v_id uuid:=nullif(p_payload->>'id','')::uuid; v_before public.expenses%rowtype;
begin
  if not coalesce((select private.is_admin()),false) then
    raise exception 'Solo un administrador puede gestionar gastos.' using errcode='42501';
  end if;
  if p_operation_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Falta la identidad de la operacion.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_receipt from private.expense_operation_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.actor_id<>auth.uid() or v_receipt.payload is distinct from p_payload then
      raise exception 'Identidad de operacion reutilizada con datos diferentes.' using errcode='23514';
    end if;
    return v_receipt.result;
  end if;
  if v_id is not null then
    select * into strict v_before from public.expenses where id=v_id for update;
    if v_before.is_voided then raise exception 'No se puede editar un gasto anulado.' using errcode='23514'; end if;
  end if;
  if v_id is null or (v_before.expense_date,v_before.type,v_before.description,v_before.amount,v_before.payment_method,v_before.observations)
    is distinct from ((p_payload->>'expenseDate')::date,p_payload->>'type',p_payload->>'description',
      (p_payload->>'amount')::numeric,p_payload->>'paymentMethod',nullif(p_payload->>'observations','')) then
    v_result:=public.save_expense_atomic(v_id,(p_payload->>'expenseDate')::date,p_payload->>'type',
      p_payload->>'description',(p_payload->>'amount')::numeric,p_payload->>'paymentMethod',p_payload->>'observations');
    v_id:=(v_result->>'id')::uuid;
  else
    v_result:=jsonb_build_object('id',v_id,'action','update');
  end if;
  if p_payload ? 'partRequestId' or p_payload ? 'repairOrderId' then
    perform private.link_expense_purchase_atomic(v_id,nullif(p_payload->>'partRequestId','')::uuid,
      nullif(p_payload->>'repairOrderId','')::uuid,v_before.repair_order_id,v_before.part_request_id);
  end if;
  insert into private.expense_operation_receipts(operation_id,actor_id,payload,result)
    values(p_operation_id,auth.uid(),p_payload,v_result);
  return v_result;
end $$;
create function public.save_expense_linked_atomic(p_operation_id uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_expense_linked_atomic(p_operation_id,p_payload)
$$;

create function private.get_purchase_commitments_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce((select private.is_admin()),false) then
    raise exception 'Solo un administrador puede consultar compromisos.' using errcode='42501';
  end if;
  -- A cancelled purchase may still owe its supplier. Only stock reservations have no buyer.
  return (select jsonb_build_object('knownOutstanding',coalesce(sum(greatest(p.quantity*p.unit_cost-coalesce(e.paid,0),0)),0),
    'unknownCostCount',count(*) filter(where p.unit_cost is null),'purchaseCount',count(*))
    from public.repair_part_requests p left join (
      select part_request_id,sum(amount) paid from public.expenses
      where not is_voided and impacts_cash and part_request_id is not null group by part_request_id
    ) e on e.part_request_id=p.id where p.buyer_id is not null);
end $$;
create function public.get_purchase_commitments_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.get_purchase_commitments_snapshot() $$;

create function private.get_expense_link_options(p_kind text,p_search text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_total integer; v_page integer; v_search text:=left(trim(coalesce(p_search,'')),100);
begin
  if not coalesce((select private.is_admin()),false) then
    raise exception 'Solo un administrador puede consultar compras.' using errcode='42501';
  end if;
  if p_kind not in ('part','repair') or p_kind is null or p_page is null or p_page<1 or p_page>100000 then
    raise exception 'Revisa el tipo y pagina de consulta.' using errcode='22023';
  end if;
  if p_kind='part' then
    select count(*) into v_total from public.repair_part_requests p join public.repair_access_orders o on o.id=p.order_id
      where p.buyer_id is not null and (v_search='' or strpos(lower(p.description||' '||coalesce(p.supplier,'')||' '||o.repair_number),lower(v_search))>0);
    v_page:=least(p_page,greatest(1,(v_total+24)/25));
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]'::jsonb) into v_items from (
      select p.id,p.order_id as "orderId",o.repair_number as "repairNumber",p.description,p.supplier,p.quantity,p.status,
        p.quantity*p.unit_cost as "expectedCost",coalesce(e.paid,0) as "paidAmount",
        case when p.unit_cost is null then null else greatest(p.quantity*p.unit_cost-coalesce(e.paid,0),0) end as outstanding,p.created_at
      from public.repair_part_requests p join public.repair_access_orders o on o.id=p.order_id
      left join lateral (select sum(amount) paid from public.expenses where part_request_id=p.id and not is_voided and impacts_cash) e on true
      where p.buyer_id is not null and (v_search='' or strpos(lower(p.description||' '||coalesce(p.supplier,'')||' '||o.repair_number),lower(v_search))>0)
      order by p.created_at desc,p.id desc limit 25 offset (v_page-1)*25
    ) r;
  else
    select count(*) into v_total from public.repair_access_orders o where v_search='' or strpos(lower(o.repair_number),lower(v_search))>0;
    v_page:=least(p_page,greatest(1,(v_total+24)/25));
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]'::jsonb) into v_items from (
      select o.id,o.id as "orderId",o.repair_number as "repairNumber",o.issue_reported as description,o.created_at
      from public.repair_access_orders o where v_search='' or strpos(lower(o.repair_number),lower(v_search))>0
      order by o.created_at desc,o.id desc limit 25 offset (v_page-1)*25
    ) r;
  end if;
  return jsonb_build_object('items',v_items,'page',v_page,'total',v_total,'pageSize',25,'totalPages',greatest(1,(v_total+24)/25));
end $$;
create function public.get_expense_link_options(p_kind text,p_search text,p_page integer) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.get_expense_link_options(p_kind,p_search,p_page) $$;

revoke all on function private.guard_expense_purchase_link() from public,anon;
revoke all on function private.link_expense_purchase_atomic(uuid,uuid,uuid,uuid,uuid),public.link_expense_purchase_atomic(uuid,uuid,uuid,uuid,uuid),
  private.save_expense_linked_atomic(uuid,jsonb),public.save_expense_linked_atomic(uuid,jsonb),
  private.get_purchase_commitments_snapshot(),public.get_purchase_commitments_snapshot(),
  private.get_expense_link_options(text,text,integer),public.get_expense_link_options(text,text,integer) from public,anon;
grant execute on function private.link_expense_purchase_atomic(uuid,uuid,uuid,uuid,uuid),public.link_expense_purchase_atomic(uuid,uuid,uuid,uuid,uuid),
  private.save_expense_linked_atomic(uuid,jsonb),public.save_expense_linked_atomic(uuid,jsonb),
  private.get_purchase_commitments_snapshot(),public.get_purchase_commitments_snapshot(),
  private.get_expense_link_options(text,text,integer),public.get_expense_link_options(text,text,integer) to authenticated;
