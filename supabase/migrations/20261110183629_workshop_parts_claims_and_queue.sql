begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create table public.repair_supplier_claims (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.repair_part_requests(id),
  order_id uuid not null references public.repair_access_orders(id),
  warranty_return_id uuid references public.repair_warranty_returns(id),
  quantity integer not null check (quantity between 1 and 10000),
  reason text not null check (length(trim(reason)) between 3 and 2000),
  supplier text,
  status text not null default 'open' check (status in ('open','sent','resolved','cancelled')),
  resolution text check (length(resolution) <= 2000),
  extra_cost numeric(12,2) check (extra_cost >= 0),
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((closed_at is not null) = (status in ('resolved','cancelled'))),
  check (status not in ('resolved','cancelled') or length(trim(coalesce(resolution,''))) >= 3)
);
create index repair_supplier_claims_order_idx on public.repair_supplier_claims(order_id,created_at desc);
create index repair_supplier_claims_part_open_idx on public.repair_supplier_claims(part_id) where closed_at is null;
create index repair_supplier_claims_queue_idx on public.repair_supplier_claims(closed_at,created_at desc,id);
alter table public.repair_supplier_claims enable row level security;
revoke all on public.repair_supplier_claims from public,anon,authenticated;
create policy supplier_claims_admin_read on public.repair_supplier_claims for select to authenticated using ((select private.is_admin()));
grant select on public.repair_supplier_claims to authenticated;
grant all on public.repair_supplier_claims to service_role;

create table private.workshop_supplier_claim_receipts (
  operation_id uuid primary key,
  fingerprint jsonb not null,
  result jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
revoke all on private.workshop_supplier_claim_receipts from public,anon,authenticated;

create function private.workshop_save_supplier_claim(p_operation_id uuid,p_part_id uuid,p_expected_version integer,p_claim_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_part public.repair_part_requests%rowtype;
  v_claim public.repair_supplier_claims%rowtype;
  v_receipt private.workshop_supplier_claim_receipts%rowtype;
  v_fingerprint jsonb := jsonb_build_object('part',p_part_id,'version',p_expected_version,'claim',p_claim_id,'payload',p_payload);
  v_result jsonb; v_order_id uuid; v_quantity integer; v_active integer; v_warranty uuid; v_status text; v_resolution text; v_cost numeric;
begin
  if (select private.is_admin()) is not true then raise exception 'Los reclamos al proveedor se gestionan desde mostrador.' using errcode='42501'; end if;
  if p_operation_id is null or p_part_id is null or p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Faltan datos para guardar el reclamo.' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into v_receipt from private.workshop_supplier_claim_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.created_by is distinct from auth.uid() or v_receipt.fingerprint is distinct from v_fingerprint then
      raise exception 'Esta operacion ya se utilizo con otros datos. Actualiza la ficha.' using errcode='23514';
    end if;
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;
  select order_id into strict v_order_id from public.repair_part_requests where id=p_part_id;
  perform 1 from public.repair_access_orders where id=v_order_id for update;
  select * into strict v_part from public.repair_part_requests where id=p_part_id for update;
  v_cost := nullif(p_payload->>'extra_cost','')::numeric;
  if v_cost < 0 or v_cost > 9999999999.99 or v_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'El costo debe ser un importe valido o quedar sin informar.' using errcode='23514'; end if;
  if p_claim_id is null then
    if v_part.version is distinct from p_expected_version then raise exception 'El repuesto cambio en otro dispositivo.' using errcode='40001'; end if;
    if v_part.status='cancelled' then raise exception 'No se puede reclamar una solicitud cancelada.' using errcode='23514'; end if;
    v_quantity := (p_payload->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'Indica una cantidad recibida para reclamar.' using errcode='23514'; end if;
    select coalesce(sum(quantity),0) into v_active from public.repair_supplier_claims where part_id=p_part_id and closed_at is null;
    if v_active+v_quantity > v_part.received_quantity then raise exception 'La cantidad supera los repuestos recibidos sin reclamo activo.' using errcode='23514'; end if;
    v_warranty := nullif(p_payload->>'warranty_return_id','')::uuid;
    if v_warranty is not null and not exists(select 1 from public.repair_warranty_returns where id=v_warranty and order_id=v_order_id) then
      raise exception 'El reingreso no corresponde a esta orden.' using errcode='23514';
    end if;
    insert into public.repair_supplier_claims(part_id,order_id,warranty_return_id,quantity,reason,supplier,extra_cost,created_by,updated_by)
    values(p_part_id,v_order_id,v_warranty,v_quantity,trim(p_payload->>'reason'),v_part.supplier,v_cost,auth.uid(),auth.uid()) returning * into v_claim;
  else
    select * into strict v_claim from public.repair_supplier_claims where id=p_claim_id and part_id=p_part_id for update;
    if v_claim.version is distinct from p_expected_version then raise exception 'El reclamo cambio en otro dispositivo.' using errcode='40001'; end if;
    if v_claim.closed_at is not null then raise exception 'El reclamo ya esta cerrado. Su resolucion se conserva en el historial.' using errcode='23514'; end if;
    v_status := p_payload->>'status'; v_resolution := nullif(trim(p_payload->>'resolution'),'');
    if v_status is null or v_status not in ('open','sent','resolved','cancelled') then raise exception 'Selecciona un estado valido del reclamo.' using errcode='23514'; end if;
    update public.repair_supplier_claims set status=v_status,resolution=v_resolution,extra_cost=case when p_payload ? 'extra_cost' then v_cost else extra_cost end,
      version=version+1,updated_by=auth.uid(),updated_at=now(),closed_at=case when v_status in ('resolved','cancelled') then now() end
      where id=p_claim_id returning * into v_claim;
  end if;
  -- A shared write also serializes claims in REPEATABLE READ. Row locks alone
  -- would let a waiting transaction aggregate an obsolete snapshot of claims.
  update public.repair_part_requests set version=version+1,updated_at=now() where id=p_part_id;
  -- This is a supplier workflow, not a payment, refund or inventory adjustment.
  insert into public.workshop_events(order_id,kind,message,actor_id) values(v_order_id,'supplier_claim',
    case when p_claim_id is null then 'Reclamo al proveedor registrado' when v_claim.closed_at is not null then 'Reclamo al proveedor cerrado' else 'Reclamo al proveedor actualizado' end,auth.uid());
  v_result := jsonb_build_object('id',v_claim.id,'version',v_claim.version,'status',v_claim.status,'replayed',false);
  insert into private.workshop_supplier_claim_receipts(operation_id,fingerprint,result,created_by) values(p_operation_id,v_fingerprint,v_result,auth.uid());
  return v_result;
end $$;

create function public.workshop_save_supplier_claim(p_operation_id uuid,p_part_id uuid,p_expected_version integer,p_claim_id uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.workshop_save_supplier_claim(p_operation_id,p_part_id,p_expected_version,p_claim_id,p_payload) $$;

create function private.guard_part_supplier_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.installed_quantity>old.installed_quantity or (new.status='cancelled' and old.status<>'cancelled'))
    and exists(select 1 from public.repair_supplier_claims where part_id=old.id and closed_at is null) then
    raise exception 'Este repuesto tiene un reclamo al proveedor activo. Resolve el reclamo antes de usarlo o cancelar la solicitud.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.guard_part_supplier_claim() from public,anon,authenticated;
create trigger repair_part_supplier_claim_guard before update on public.repair_part_requests for each row execute function private.guard_part_supplier_claim();

create function private.get_workshop_parts_page(p_page integer,p_search text,p_status text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean := (select private.is_admin()); v_result jsonb; v_today date := (now() at time zone 'America/Argentina/Cordoba')::date;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para consultar repuestos.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_status is null or p_status not in ('all','requested','ordered','received','available','installed','overdue') then
    raise exception 'El filtro de repuestos no es valido.' using errcode='23514';
  end if;
  with parts as (
    select r.*,o.repair_number,c.full_name,
      (select w.id from public.repair_warranty_returns w where w.order_id=o.id and w.closed_at is null order by w.created_at desc limit 1) warranty_return_id,
      (select coalesce(sum(sc.quantity),0) from public.repair_supplier_claims sc where sc.part_id=r.id and sc.closed_at is null) claimed_quantity
    from public.repair_part_requests r join public.repair_access_orders o on o.id=r.order_id join public.repair_access_customers c on c.id=o.customer_id
    where r.status <> 'cancelled'
  ), filtered as (
    select * from parts p where
      case p_status when 'all' then p.status <> 'installed' when 'available' then p.received_quantity>p.installed_quantity and p.claimed_quantity=0
        when 'overdue' then p.expected_date < v_today and p.received_quantity<p.quantity else p.status=p_status end
      and (nullif(trim(p_search),'') is null or strpos(lower(concat_ws(' ',p.description,p.repair_number,p.full_name,case when v_admin then p.supplier end)),lower(left(trim(p_search),200)))>0)
  ), page as (
    select * from filtered order by case priority when 'urgente' then 0 when 'alta' then 1 else 2 end,created_at,id limit 50 offset (p_page-1)*50
  ) select jsonb_build_object('page',p_page,'pageSize',50,'total',(select count(*) from filtered),
    'counts',jsonb_build_object('requested',(select count(*) from parts where status='requested'),
      'ordered',(select count(*) from parts where status='ordered'),'available',(select count(*) from parts where received_quantity>installed_quantity and claimed_quantity=0),
      'overdue',(select count(*) from parts where expected_date<v_today and received_quantity<quantity),
      'claims',(select count(*) from public.repair_supplier_claims where closed_at is null)),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'orderId',order_id,'repairNumber',repair_number,'customerName',full_name,
      'description',description,'quantity',quantity,'receivedQuantity',received_quantity,'installedQuantity',installed_quantity,'status',status,
      'priority',priority,'supplier',case when v_admin then supplier end,'expectedDate',expected_date,'notes',case when v_admin then notes end,
      'unitCost',case when v_admin then unit_cost end,'productId',product_id,'version',version,'createdAt',created_at,
      'warrantyReturnId',warranty_return_id,'claimedQuantity',claimed_quantity) order by case priority when 'urgente' then 0 when 'alta' then 1 else 2 end,created_at,id) from page),'[]'::jsonb)) into v_result;
  return v_result;
end $$;
create function public.get_workshop_parts_page(p_page integer,p_search text,p_status text)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_workshop_parts_page(p_page,p_search,p_status) $$;

create function private.get_workshop_supplier_claims(p_closed boolean,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if (select private.is_admin()) is not true then raise exception 'Sin permiso para consultar reclamos al proveedor.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_closed is null then raise exception 'Pagina invalida.' using errcode='23514'; end if;
  with filtered as (select c.*,r.description,o.repair_number from public.repair_supplier_claims c join public.repair_part_requests r on r.id=c.part_id
    join public.repair_access_orders o on o.id=c.order_id where (c.closed_at is not null)=p_closed),
  page as (select * from filtered order by created_at desc,id limit 50 offset (p_page-1)*50)
  select jsonb_build_object('page',p_page,'pageSize',50,'total',(select count(*) from filtered),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'partId',part_id,'orderId',order_id,'repairNumber',repair_number,
    'description',description,'warrantyReturnId',warranty_return_id,'quantity',quantity,'reason',reason,'supplier',supplier,'status',status,
    'resolution',resolution,'extraCost',extra_cost,'version',version,'createdAt',created_at,'closedAt',closed_at) order by created_at desc,id) from page),'[]'::jsonb)) into v_result;
  return v_result;
end $$;
create function public.get_workshop_supplier_claims(p_closed boolean,p_page integer)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_workshop_supplier_claims(p_closed,p_page) $$;

revoke all on function public.workshop_save_supplier_claim(uuid,uuid,integer,uuid,jsonb),private.workshop_save_supplier_claim(uuid,uuid,integer,uuid,jsonb),
  public.get_workshop_parts_page(integer,text,text),private.get_workshop_parts_page(integer,text,text),
  public.get_workshop_supplier_claims(boolean,integer),private.get_workshop_supplier_claims(boolean,integer) from public,anon;
grant execute on function public.workshop_save_supplier_claim(uuid,uuid,integer,uuid,jsonb),private.workshop_save_supplier_claim(uuid,uuid,integer,uuid,jsonb),
  public.get_workshop_parts_page(integer,text,text),private.get_workshop_parts_page(integer,text,text),
  public.get_workshop_supplier_claims(boolean,integer),private.get_workshop_supplier_claims(boolean,integer) to authenticated;
notify pgrst,'reload schema';
commit;
