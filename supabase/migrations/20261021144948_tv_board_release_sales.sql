begin;
-- Production migration version assigned by Supabase on 2026-10-21.
set local lock_timeout='5s';

-- Additive origin metadata only: historical releases and manual sales stay untouched.
alter table public.sales add column tv_board_id uuid unique references public.tv_boards(id) on delete restrict;
alter table public.sales alter column cost_total drop not null, alter column profit_total drop not null;
alter table public.sales add constraint sale_cost_known_or_board check(
  (cost_total is not null and profit_total is not null) or (tv_board_id is not null and cost_total is null and profit_total is null));
alter table public.sale_items add column description text;
alter table public.sale_items alter column product_id drop not null, alter column unit_cost drop not null;
alter table public.sale_items add constraint sale_item_product_or_snapshot check(
  (product_id is not null and unit_cost is not null) or (product_id is null and description is not null and length(trim(description))>0));

create table private.tv_board_release_receipts (
  operation_id uuid primary key,
  request_fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.tv_board_release_receipts from public,anon,authenticated,service_role;

-- Both normal sales and board settlements consume the same sequence, without truncating 10000+.
create or replace function public.generate_sale_number()
returns text language plpgsql volatile security invoker set search_path='' as $$
declare n text;
begin
  n:=nextval('public.sale_number_seq')::text;
  return 'V-'||lpad(n,greatest(4,length(n)),'0');
end $$;

create function private.guard_tv_board_sale_projection()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_old jsonb; v_new jsonb; v_old_sale uuid; v_new_sale uuid; v_linked boolean; v_board uuid;
begin
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
  if tg_table_name='sales' then
    v_linked:=coalesce(v_old->>'tv_board_id',v_new->>'tv_board_id') is not null;
    if current_user<>'postgres' and v_linked then
      raise exception 'Esta venta proviene de una liberacion de placa y conserva su registro financiero.' using errcode='23514';
    end if;
    if tg_op='UPDATE' and v_old->>'tv_board_id' is not null then
      raise exception 'La venta vinculada a la placa es inmutable.' using errcode='23514';
    end if;
  else
    if tg_table_name in ('sale_items','sale_payments') then
      v_old_sale:=(v_old->>'sale_id')::uuid; v_new_sale:=(v_new->>'sale_id')::uuid;
    elsif tg_table_name='movimientos_caja' then
      if v_old->>'referencia_tabla'='sales' then v_old_sale:=(v_old->>'referencia_id')::uuid; end if;
      if v_new->>'referencia_tabla'='sales' then v_new_sale:=(v_new->>'referencia_id')::uuid; end if;
    end if;
    select exists(select 1 from public.sales s where s.id in (v_old_sale,v_new_sale) and s.tv_board_id is not null) into v_linked;
    if current_user<>'postgres' and v_linked then
      raise exception 'El cobro de esta placa esta vinculado a su liberacion y no se modifica por separado.' using errcode='23514';
    end if;
    if tg_table_name='sale_items' and tg_op<>'DELETE' then
      select tv_board_id into v_board from public.sales where id=v_new_sale;
      if v_board is null and (new.product_id is null or new.unit_cost is null) then
        raise exception 'Una venta de productos requiere producto y costo. Las placas usan su liberacion.' using errcode='23514';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.guard_tv_board_sale_projection() from public,anon,authenticated;
create trigger tv_board_projection_guard before insert or update or delete on public.sales
  for each row execute function private.guard_tv_board_sale_projection();
create trigger tv_board_projection_guard before insert or update or delete on public.sale_items
  for each row execute function private.guard_tv_board_sale_projection();
create trigger tv_board_projection_guard before insert or update or delete on public.sale_payments
  for each row execute function private.guard_tv_board_sale_projection();
create trigger tv_board_projection_guard before insert or update or delete on public.movimientos_caja
  for each row execute function private.guard_tv_board_sale_projection();

-- Reject before stock restoration or child deletion in the existing merchandise RPCs.
do $$
declare signature text; definition text; anchor text:='if v_user_id is null then';
begin
  foreach signature in array array['public.save_sale_atomic(uuid,timestamptz,jsonb,jsonb,text)','public.delete_sale_atomic(uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position(anchor in definition)=0 then raise exception 'Unexpected sale RPC definition: %',signature; end if;
    execute replace(definition,anchor,
      'if p_sale_id is not null and exists(select 1 from public.sales where id=p_sale_id and tv_board_id is not null) then
        raise exception ''Esta venta esta vinculada a la liberacion de una placa y conserva su registro financiero.'' using errcode=''23514'';
      end if;
      '||anchor);
  end loop;
end $$;

create function private.guard_tv_board_release_link()
returns trigger language plpgsql security invoker set search_path='' as $$
declare linked public.sales%rowtype;
begin
  select * into linked from public.sales where tv_board_id=old.id;
  if found and row(new.brand,new.model,new.board_type,new.acquisition_cost,new.listed_price)
      is distinct from row(old.brand,old.model,old.board_type,old.acquisition_cost,old.listed_price) then
    raise exception 'Esta placa tiene una venta registrada. Sus datos e importes conservan el comprobante original.' using errcode='23514';
  end if;
  if old.released_at is null and new.released_at is not null then
    if current_user not in ('postgres','service_role') then
      raise exception 'Confirma la liberacion desde su accion de seguimiento.' using errcode='42501';
    end if;
    if linked.id is null or linked.subtotal is distinct from new.mercado_libre_net_amount
      or linked.sold_at is distinct from new.released_at
      or (select count(*) from public.sale_payments where sale_id=linked.id)<>1
      or not exists(select 1 from public.sale_payments where sale_id=linked.id and method in ('nx','mp') and amount=linked.subtotal)
      or (select count(*) from public.movimientos_caja where referencia_tabla='sales' and referencia_id=linked.id)<>1 then
      raise exception 'Selecciona la cuenta de destino para registrar la venta y el cobro al confirmar la liberacion.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_tv_board_release_link() from public,anon,authenticated;
create trigger tv_board_release_link_guard before update on public.tv_boards
  for each row execute function private.guard_tv_board_release_link();

create function private.release_tv_board_to_sale(p_board_id uuid,p_expected_version integer,p_operation_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.tv_boards%rowtype; r private.tv_board_release_receipts%rowtype;
  v_request jsonb; v_result jsonb; v_sale uuid:=gen_random_uuid(); v_number text;
  v_description text; v_time timestamptz:=now();
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede confirmar el cobro de placas.' using errcode='42501'; end if;
  if p_board_id is null or p_expected_version is null or p_expected_version<1 or p_operation_id is null
    or p_method is null or p_method not in ('nx','mp') then
    raise exception 'Selecciona NX Santi o NX Local como cuenta de destino.' using errcode='23514';
  end if;
  v_request:=jsonb_build_object('actor',auth.uid(),'board',p_board_id,'version',p_expected_version,'method',p_method);
  perform pg_advisory_xact_lock(hashtextextended('tv-board.sale:'||p_operation_id::text,0));
  select * into r from private.tv_board_release_receipts where operation_id=p_operation_id;
  if found then
    if r.request_fingerprint is distinct from v_request then raise exception 'Esta operacion ya se uso con otros datos. Conserva la cuenta original para reintentar.' using errcode='23514'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into b from public.tv_boards where id=p_board_id for update;
  if not found then raise exception 'No encontramos la placa.' using errcode='P0002'; end if;
  if b.financial_version is distinct from p_expected_version then raise exception 'La placa cambio en otro dispositivo. Actualiza antes de continuar.' using errcode='40001'; end if;
  if b.released_at is not null then raise exception 'Esta placa ya tiene su liberacion registrada. No se genera una segunda venta.' using errcode='23514'; end if;
  if b.claim_status<>'none' or b.sold_at is null or b.mercado_libre_net_amount is null or b.mercado_libre_net_amount<=0 then
    raise exception 'La placa debe estar vendida, con neto positivo y sin reclamo abierto ni anulacion.' using errcode='23514';
  end if;
  v_number:=public.generate_sale_number();
  v_description:='Placa '||case b.board_type when 'fuente' then 'Fuente' when 'main' then 'Main' when 'tcom' then 'Tcom' else 'unica' end||' - '||b.brand||' - '||b.model;
  insert into public.sales(id,sale_number,subtotal,cost_total,profit_total,notes,sold_at,created_by,tv_board_id)
    values(v_sale,v_number,b.mercado_libre_net_amount,b.acquisition_cost,
      case when b.acquisition_cost is not null then b.mercado_libre_net_amount-b.acquisition_cost end,
      'Liberacion de MercadoLibre. '||v_description,v_time,auth.uid(),b.id);
  insert into public.sale_items(sale_id,product_id,description,quantity,unit_price,unit_cost,total)
    values(v_sale,null,v_description,1,b.mercado_libre_net_amount,b.acquisition_cost,b.mercado_libre_net_amount);
  insert into public.sale_payments(sale_id,method,amount) values(v_sale,p_method,b.mercado_libre_net_amount);
  insert into public.movimientos_caja(tipo,monto,medio_pago,descripcion,referencia_tabla,referencia_id,created_by,fecha)
    values('venta',b.mercado_libre_net_amount,p_method,'Venta '||v_number||' - '||v_description,'sales',v_sale,auth.uid(),v_time);
  -- Existing transition owns version, event, audit and claim eligibility in the same transaction.
  v_result:=private.tv_board_sale_transition(b.id,p_expected_version,p_operation_id,'confirm_release','');
  v_result:=v_result||jsonb_build_object('saleId',v_sale,'saleNumber',v_number,'method',p_method,
    'netAmount',b.mercado_libre_net_amount,'releasedAt',v_time,'costTotal',b.acquisition_cost,
    'profitTotal',case when b.acquisition_cost is not null then b.mercado_libre_net_amount-b.acquisition_cost end);
  insert into private.tv_board_release_receipts(operation_id,request_fingerprint,result) values(p_operation_id,v_request,v_result);
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
    values('sales',v_sale::text,'insert',jsonb_build_object('origin','tv_board_release','boardId',b.id,'saleNumber',v_number,'netAmount',b.mercado_libre_net_amount,'method',p_method,'operationId',p_operation_id),auth.uid());
  return v_result;
end $$;
revoke all on function private.release_tv_board_to_sale(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function private.release_tv_board_to_sale(uuid,integer,uuid,text) to authenticated;
create function public.release_tv_board_to_sale(p_board_id uuid,p_expected_version integer,p_operation_id uuid,p_method text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.release_tv_board_to_sale(p_board_id,p_expected_version,p_operation_id,p_method);
$$;
revoke all on function public.release_tv_board_to_sale(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.release_tv_board_to_sale(uuid,integer,uuid,text) to authenticated;

-- Preserve the established aggregate and its date boundaries while exposing cost coverage.
do $reports$
declare definition text; anchors text[]; replacements text[]; i integer;
begin
  definition:=pg_get_functiondef('public.get_reports_performance_snapshot(date,date,date,date,date,date)'::regprocedure);
  anchors:=array[
    'coalesce(sum(s.profit_total), 0)::numeric as sales_profit',
    '''sales_profit'', sm.sales_profit,',
    'coalesce(p.name, ''Producto sin nombre'')',
    'coalesce(c.name, ''Sin categoria'')',
    'coalesce(sum(si.total - (si.unit_cost * si.quantity)), 0)::numeric as profit'
  ];
  replacements:=array[
    'coalesce(sum(s.profit_total), 0)::numeric as sales_profit, count(s.id) filter(where s.profit_total is null)::bigint as sales_unknown_cost_count',
    '''sales_profit'', sm.sales_profit, ''sales_unknown_cost_count'', sm.sales_unknown_cost_count,',
    'coalesce(p.name, nullif(trim(si.description),''''), ''Venta sin producto de inventario'')',
    'case when p.id is null then ''Sin producto de inventario'' else coalesce(c.name, ''Sin categoria'') end',
    'sum(si.total - (si.unit_cost * si.quantity))::numeric as profit, count(*) filter(where si.unit_cost is null)::bigint as unknown_cost_count'
  ];
  for i in 1..array_length(anchors,1) loop
    if position(anchors[i] in definition)=0 then raise exception 'Unexpected report aggregate definition at anchor %',i; end if;
    definition:=replace(definition,anchors[i],replacements[i]);
  end loop;
  execute definition;
end $reports$;

notify pgrst,'reload schema';
commit;
