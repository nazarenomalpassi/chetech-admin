begin;
create or replace function private.workshop_manage_part(p_id uuid,p_expected_version integer,p_action text,p_quantity integer,p_supplier text,p_unit_cost numeric,p_expected_date date,p_notes text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_part public.repair_part_requests%rowtype; v_order public.repair_access_orders%rowtype; v_stock integer; v_reserved integer; v_status text;
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para actualizar repuestos.' using errcode='42501'; end if;
  if p_action<>'install' and not (select private.is_admin()) then raise exception 'La compra y recepcion se registran desde mostrador.' using errcode='42501'; end if;
  select order_id into strict v_part.order_id from public.repair_part_requests where id=p_id;
  select * into strict v_order from public.repair_access_orders where id=v_part.order_id for update;
  select * into strict v_part from public.repair_part_requests where id=p_id for update;
  if v_part.version<>p_expected_version then raise exception 'El pedido cambio. Actualiza antes de guardar.' using errcode='40001'; end if;
  if v_part.status='cancelled' or v_order.delivered_at is not null then raise exception 'El pedido u orden ya esta cerrado.' using errcode='23514'; end if;
  if p_action in ('order','reserve') and v_order.approval_status<>'accepted' and v_order.status<>'presupuestado_aceptado' and length(trim(coalesce(p_notes,'')))<3 then raise exception 'Falta autorizacion del cliente. Para una compra excepcional indica el motivo.' using errcode='23514'; end if;
  if p_action='order' then
    if v_part.status<>'requested' then raise exception 'Este repuesto ya fue gestionado.' using errcode='23514'; end if;
    if length(trim(coalesce(p_supplier,'')))<2 then raise exception 'Indica el proveedor.' using errcode='23514'; end if;
    update public.repair_part_requests set status='ordered',supplier=p_supplier,unit_cost=p_unit_cost,expected_date=p_expected_date,buyer_id=auth.uid(),notes=nullif(p_notes,'') where id=p_id;
  elsif p_action in ('receive','reserve') then
    if p_quantity<=0 or v_part.received_quantity+p_quantity>v_part.quantity then raise exception 'La cantidad supera lo pendiente de recibir.' using errcode='23514'; end if;
    if p_action='receive' and v_part.status<>'ordered' then raise exception 'Primero registra la compra.' using errcode='23514'; end if;
    if v_part.product_id is not null then
      select stock into strict v_stock from public.products where id=v_part.product_id for update;
      select coalesce(sum(reserved_quantity),0) into v_reserved from public.repair_part_requests where product_id=v_part.product_id;
      if p_action='reserve' and v_stock-v_reserved<p_quantity then raise exception 'No hay stock disponible para reservar.' using errcode='23514'; end if;
      if p_action='receive' then update public.products set stock=stock+p_quantity,updated_at=now() where id=v_part.product_id; end if;
    elsif p_action='reserve' then raise exception 'Vincula un producto para reservar stock existente.' using errcode='23514'; end if;
    update public.repair_part_requests set received_quantity=received_quantity+p_quantity,
      reserved_quantity=reserved_quantity+case when product_id is not null then p_quantity else 0 end,
      status=case when received_quantity+p_quantity=quantity then 'received' else status end where id=p_id;
  elsif p_action='install' then
    if p_quantity<=0 or v_part.installed_quantity+p_quantity>v_part.received_quantity then raise exception 'No podes utilizar partes que todavia no recibiste.' using errcode='23514'; end if;
    if v_part.product_id is not null then
      select stock into strict v_stock from public.products where id=v_part.product_id for update;
      if v_stock<p_quantity or v_part.reserved_quantity<p_quantity then raise exception 'La reserva o stock no alcanza.' using errcode='23514'; end if;
      update public.repair_part_requests set reserved_quantity=reserved_quantity-p_quantity where id=p_id;
      update public.products set stock=stock-p_quantity,updated_at=now() where id=v_part.product_id;
    end if;
    update public.repair_part_requests set installed_quantity=installed_quantity+p_quantity,status=case when installed_quantity+p_quantity=quantity then 'installed' else status end where id=p_id;
  elsif p_action='cancel' then
    if v_part.installed_quantity>0 then raise exception 'Este pedido tiene partes utilizadas. Registra la devolucion mediante una correccion.' using errcode='23514'; end if;
    if length(trim(coalesce(p_notes,'')))<3 then raise exception 'Indica el motivo de cancelacion.' using errcode='23514'; end if;
    update public.repair_part_requests set status='cancelled',reserved_quantity=0,notes=p_notes where id=p_id;
  else raise exception 'La accion de repuesto no es valida.' using errcode='23514'; end if;
  update public.repair_part_requests set version=version+1,updated_at=now() where id=p_id;
  if not exists(select 1 from public.repair_part_requests where order_id=v_part.order_id and status not in ('cancelled','installed') and received_quantity<quantity) then update public.workshop_tasks set resolved_at=now(),resolved_by=auth.uid() where order_id=v_part.order_id and kind='parts' and resolved_at is null; end if;
  select status into v_status from public.repair_part_requests where id=p_id;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(v_part.order_id,'part_update','Repuesto: '||v_part.description||' - '||p_action||case when p_quantity>0 then ' ('||p_quantity||')' else '' end,auth.uid());
  update public.repair_access_orders set updated_by=auth.uid(),updated_at=now() where id=v_part.order_id;
  return jsonb_build_object('id',p_id,'status',v_status);
end $$;

create or replace function private.guard_reserved_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare v_reserved integer;
begin
  select coalesce(sum(reserved_quantity),0) into v_reserved from public.repair_part_requests where product_id=new.id;
  if new.stock<v_reserved then raise exception 'Hay % unidades reservadas para reparaciones. Libera la reserva antes de vender o reducir el stock.',v_reserved using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists products_reserved_stock_guard on public.products;
create trigger products_reserved_stock_guard before update of stock on public.products for each row execute function private.guard_reserved_stock();
create or replace function private.get_workshop_product_availability(p_product_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para consultar productos.' using errcode='42501'; end if;
  if coalesce(cardinality(p_product_ids),0)>100 then raise exception 'Consulta hasta 100 productos por pagina.' using errcode='23514'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'reserved',coalesce(r.reserved,0),'available',greatest(0,p.stock-coalesce(r.reserved,0)))),'[]'::jsonb) from public.products p left join (select product_id,sum(reserved_quantity) reserved from public.repair_part_requests where product_id=any(p_product_ids) group by product_id) r on r.product_id=p.id where p.id=any(p_product_ids));
end $$;
create or replace function public.get_workshop_product_availability(p_product_ids uuid[]) returns jsonb language sql stable set search_path='' as $$ select private.get_workshop_product_availability(p_product_ids) $$;
revoke all on function private.get_workshop_product_availability(uuid[]), public.get_workshop_product_availability(uuid[]) from public,anon;
grant execute on function private.get_workshop_product_availability(uuid[]), public.get_workshop_product_availability(uuid[]) to authenticated,service_role;
create or replace function private.get_workshop_product_id(p_sku text) returns uuid language plpgsql stable security definer set search_path='' as $$
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para consultar productos.' using errcode='42501'; end if;
  return (select id from public.products where lower(sku)=lower(trim(left(p_sku,100))) and is_active limit 1);
end $$;
create or replace function public.get_workshop_product_id(p_sku text) returns uuid language sql stable set search_path='' as $$ select private.get_workshop_product_id(p_sku) $$;
revoke all on function private.get_workshop_product_id(text), public.get_workshop_product_id(text) from public,anon;
grant execute on function private.get_workshop_product_id(text), public.get_workshop_product_id(text) to authenticated,service_role;
commit;
