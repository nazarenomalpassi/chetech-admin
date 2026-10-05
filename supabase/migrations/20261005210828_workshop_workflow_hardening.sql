begin;
set local lock_timeout='5s';

-- Historical receipts cannot prove the original expected version: keep them
-- unverified rather than inventing an actor/request fingerprint during backfill.
alter table public.repair_customer_decisions
  add column if not exists request_fingerprint jsonb;

-- Work-state history must accept the same vocabulary as the order itself.
alter table public.repair_access_status_history drop constraint if exists repair_access_status_history_next_status_check;
alter table public.repair_access_status_history add constraint repair_access_status_history_next_status_check check
  (next_status in ('pendiente_revision','en_revision','presupuestado','presupuestado_aceptado','presupuestado_rechazado','en_reparacion','en_pruebas','listo_para_retirar','retirado','sin_solucion'));

create or replace function private.workshop_decide(
  p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_decision text,p_channel text,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_order public.repair_access_orders%rowtype;
  v_receipt public.repair_customer_decisions%rowtype;
  v_actor uuid := auth.uid();
  v_request jsonb := jsonb_build_object('orderId',p_order_id,'expectedVersion',p_expected_version,
    'actorId',v_actor,'decision',p_decision,'channel',p_channel,'notes',coalesce(p_notes,''));
  v_quote uuid; v_receipt_id uuid;
begin
  if (select private.is_admin()) is not true then
    raise exception 'Solo mostrador puede registrar la decision del cliente.' using errcode='42501';
  end if;
  if p_operation_id is null then raise exception 'Indica una identidad de operacion.' using errcode='23514'; end if;
  -- Serialize same-order retries before reading their immutable receipt.
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  select * into v_receipt from public.repair_customer_decisions where operation_id=p_operation_id;
  if found then
    if v_receipt.order_id is distinct from p_order_id or v_receipt.recorded_by is distinct from v_actor
      or v_receipt.request_fingerprint is distinct from v_request then
      raise exception 'La operacion ya existe con otro actor o solicitud; no se puede reutilizar.' using errcode='23514';
    end if;
    return jsonb_build_object('id',p_order_id,'replayed',true);
  end if;
  if v_order.workflow_version is distinct from p_expected_version then
    raise exception 'La orden cambio en otro dispositivo. Actualiza y revisa el presupuesto.' using errcode='40001';
  end if;
  if p_decision is null or p_decision not in ('accepted','rejected','revoked')
    or p_channel is null or p_channel not in ('presencial','telefono','whatsapp','portal') then
    raise exception 'La decision o el canal no son validos.' using errcode='23514';
  end if;
  if v_order.delivered_at is not null then raise exception 'La orden ya fue entregada.' using errcode='23514'; end if;
  if p_decision='revoked' and (v_order.approval_status<>'accepted' or length(trim(coalesce(p_notes,'')))<3) then
    raise exception 'Indica el motivo para revocar una aceptacion vigente.' using errcode='23514';
  end if;
  if p_decision<>'revoked' and v_order.approval_status='accepted' then
    raise exception 'Este presupuesto ya tiene una aceptacion vigente.' using errcode='23514';
  end if;
  if p_decision='accepted' and coalesce(v_order.budget_amount,0)<=0 then
    raise exception 'Carga el importe y alcance del presupuesto antes de confirmarlo.' using errcode='23514';
  end if;
  if v_order.budget_revision=0 then
    update public.repair_access_orders set budget_revision=1 where id=p_order_id;
    v_order.budget_revision:=1;
  end if;
  insert into public.repair_budget_versions(order_id,revision,amount,detail,created_by)
    values(p_order_id,v_order.budget_revision,coalesce(v_order.budget_amount,0),coalesce(v_order.budget_detail,''),v_actor)
    on conflict do nothing;
  select id into strict v_quote from public.repair_budget_versions where order_id=p_order_id and revision=v_order.budget_revision;
  insert into public.repair_customer_decisions(operation_id,order_id,budget_version_id,decision,channel,notes,recorded_by,request_fingerprint)
    values(p_operation_id,p_order_id,v_quote,p_decision,p_channel,coalesce(p_notes,''),v_actor,v_request)
    on conflict(operation_id) do nothing returning id into v_receipt_id;
  if not found then
    -- A different order can race for the same operation ID. Roll back all work.
    raise exception 'La operacion ya fue utilizada por otra solicitud.' using errcode='23514';
  end if;
  update public.repair_access_orders set approval_status=p_decision,
    approved_amount=case when p_decision='accepted' then budget_amount else null end,
    approved_at=case when p_decision='accepted' then now() else null end,
    budget_response_at=now(),budget_response_notes=nullif(p_notes,''),
    status=case p_decision when 'accepted' then 'presupuestado_aceptado' when 'rejected' then 'presupuestado_rechazado' else 'presupuestado' end,
    updated_by=v_actor,updated_at=now() where id=p_order_id;
  -- The order trigger may already have opened approval on revocation. Do not
  -- immediately resolve it or create a return/delivery task for revoked consent.
  update public.workshop_tasks set resolved_at=now(),resolved_by=v_actor
    where order_id=p_order_id and resolved_at is null and kind in ('approval','work','delivery')
      and kind<>case p_decision when 'revoked' then 'approval' when 'accepted' then 'work' else 'delivery' end;
  insert into public.workshop_tasks(order_id,kind,title,assigned_to)
    values(p_order_id,
      case p_decision when 'revoked' then 'approval' when 'accepted' then 'work' else 'delivery' end,
      case p_decision when 'revoked' then 'Consultar autorizacion del cliente'
        when 'accepted' then 'Continuar trabajo autorizado' else 'Coordinar devolucion del equipo' end,
      case when p_decision='accepted' then v_order.technician_id else null end) on conflict do nothing;
  insert into public.workshop_events(order_id,kind,message,actor_id)
    values(p_order_id,'decision',case p_decision when 'accepted' then 'Cliente confirmo presupuesto version '
      when 'rejected' then 'Cliente rechazo presupuesto version ' else 'Aceptacion revocada, presupuesto version ' end
      ||v_order.budget_revision||' por '||p_channel,v_actor);
  return jsonb_build_object('id',p_order_id);
end $$;

create or replace function private.guard_workshop_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and (select private.is_technician())
    and new.status in ('presupuestado_aceptado','presupuestado_rechazado','retirado') then
    raise exception 'La aprobacion del cliente y la entrega se registran desde mostrador.' using errcode='42501';
  end if;
  if (new.budget_amount,new.budget_detail) is distinct from (old.budget_amount,old.budget_detail) then
    if old.is_paid and new.budget_amount is distinct from old.budget_amount then
      raise exception 'El importe cobrado esta protegido. Registra una correccion desde cobros.' using errcode='23514';
    end if;
    new.budget_revision := old.budget_revision+1;
    new.approval_status := 'pending';
    new.approved_amount := null;
    new.approved_at := null;
    if old.approval_status='accepted' then new.status := 'presupuestado'; end if;
  elsif new.approval_status is not distinct from old.approval_status then
    new.budget_response_at := old.budget_response_at;
  end if;
  if new.status in ('en_reparacion','en_pruebas') and new.status is distinct from old.status
    and new.approval_status<>'accepted'
    and not (old.approval_status='legacy' and new.approval_status='legacy' and old.status in ('en_reparacion','en_pruebas')) then
    raise exception 'Primero registra la autorizacion del cliente.' using errcode='23514';
  end if;
  if new.status='listo_para_retirar' and new.status is distinct from old.status then
    if new.quality_checked_at is null then
      raise exception 'Completa el control de calidad antes de marcar listo para retirar.' using errcode='23514';
    end if;
    -- UPDATE owns the order lock already; every workshop writer uses order -> part -> product.
    perform 1 from public.repair_part_requests where order_id=new.id order by id for update;
    if exists(select 1 from public.repair_part_requests where order_id=new.id
      and status<>'cancelled' and received_quantity<quantity) then
      raise exception 'Completa o cancela los repuestos pendientes antes de marcar listo para retirar.' using errcode='23514';
    end if;
  end if;
  new.workflow_version := old.workflow_version+1;
  return new;
end $$;

create or replace function private.workshop_save(p_order_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_status text; v_tech public.profiles%rowtype;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para actualizar la orden.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
  v_status:=coalesce(nullif(p_payload->>'status',''),v_order.status);
  if v_status in ('presupuestado_aceptado','presupuestado_rechazado','retirado') and v_status<>v_order.status then raise exception 'Usa la accion de confirmacion del cliente o de entrega.' using errcode='23514'; end if;
  if p_payload ? 'technician_id' then
    if (select private.is_admin()) is not true then raise exception 'La asignacion se realiza desde mostrador.' using errcode='42501'; end if;
    if nullif(p_payload->>'technician_id','') is not null then
      select * into strict v_tech from public.profiles where id=(p_payload->>'technician_id')::uuid and role in ('admin','tecnico','empleado');
    end if;
  end if;
  if not (select private.is_admin()) and (p_payload ? 'is_paid' or p_payload ? 'picked_up_at' or p_payload ? 'delivered_at') then raise exception 'El cobro y la entrega se realizan desde mostrador.' using errcode='42501'; end if;
  update public.repair_access_orders set
    status=v_status,
    budget_amount=case when is_paid then budget_amount else coalesce((p_payload->>'budget_amount')::numeric,budget_amount,0) end,
    budget_detail=case when p_payload ? 'budget_detail' then nullif(p_payload->>'budget_detail','') else budget_detail end,
    final_amount=case when is_paid then final_amount else coalesce((p_payload->>'final_amount')::numeric,final_amount,(p_payload->>'budget_amount')::numeric) end,
    technical_diagnosis=case when p_payload ? 'technical_diagnosis' then nullif(p_payload->>'technical_diagnosis','') else technical_diagnosis end,
    repair_progress=case when p_payload ? 'repair_progress' then nullif(p_payload->>'repair_progress','') else repair_progress end,
    internal_observations=case when p_payload ? 'internal_observations' then nullif(p_payload->>'internal_observations','') else internal_observations end,
    work_performed=case when p_payload ? 'work_performed' then nullif(p_payload->>'work_performed','') else work_performed end,
    used_parts=case when p_payload ? 'used_parts' then nullif(p_payload->>'used_parts','') else used_parts end,
    technician_id=case when p_payload ? 'technician_id' then nullif(p_payload->>'technician_id','')::uuid else technician_id end,
    technician_name=case when p_payload ? 'technician_id' then v_tech.full_name when p_payload ? 'technician_name' then nullif(p_payload->>'technician_name','') else technician_name end,
    physical_location=case when p_payload ? 'physical_location' then nullif(p_payload->>'physical_location','') else physical_location end,
    next_action_date=case when p_payload ? 'next_action_date' then nullif(p_payload->>'next_action_date','')::date else next_action_date end,
    has_warranty=coalesce((p_payload->>'has_warranty')::boolean,has_warranty),
    warranty_days=coalesce((p_payload->>'warranty_days')::integer,warranty_days),
    warranty_conditions=case when p_payload ? 'warranty_conditions' then nullif(p_payload->>'warranty_conditions','') else warranty_conditions end,
    quality_checked_at=case when coalesce((p_payload->>'quality_checked')::boolean,false) then coalesce(quality_checked_at,now()) else quality_checked_at end,
    quality_checked_by=case when coalesce((p_payload->>'quality_checked')::boolean,false) and quality_checked_at is null then auth.uid() else quality_checked_by end,
    quality_notes=case when p_payload ? 'quality_notes' then nullif(p_payload->>'quality_notes','') else quality_notes end,
    reviewed_at=case when v_status='en_revision' then coalesce(reviewed_at,now()) else reviewed_at end,
    budgeted_at=case when coalesce((p_payload->>'budget_amount')::numeric,0)>0 then coalesce(budgeted_at,now()) else budgeted_at end,
    repair_started_at=case when v_status='en_reparacion' then coalesce(repair_started_at,now()) else repair_started_at end,
    finished_at=case when v_status='listo_para_retirar' then coalesce(finished_at,now()) else finished_at end,
    updated_by=auth.uid(),updated_at=now() where id=p_order_id returning status into v_status;
  if v_status is distinct from v_order.status then
    insert into public.repair_access_status_history(repair_order_id,previous_status,next_status,changed_by,notes)
      values(p_order_id,v_order.status,v_status,auth.uid(),p_payload->>'repair_progress');
  end if;
  return jsonb_build_object('id',p_order_id);
end $$;

create or replace function private.workshop_manage_part(
  p_id uuid,p_expected_version integer,p_action text,p_quantity integer,p_supplier text,p_unit_cost numeric,p_expected_date date,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_part public.repair_part_requests%rowtype; v_order public.repair_access_orders%rowtype; v_stock integer; v_reserved integer; v_status text;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para actualizar repuestos.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('order','receive','reserve','install','cancel') then raise exception 'La accion de repuesto no es valida.' using errcode='23514'; end if;
  if p_action<>'install' and (select private.is_admin()) is not true then raise exception 'La compra y recepcion se registran desde mostrador.' using errcode='42501'; end if;
  -- Discover without locking, then acquire the same order -> part -> product hierarchy on every action.
  select order_id into strict v_part.order_id from public.repair_part_requests where id=p_id;
  select * into strict v_order from public.repair_access_orders where id=v_part.order_id for update;
  select * into strict v_part from public.repair_part_requests where id=p_id for update;
  if v_part.order_id is distinct from v_order.id or v_part.version is distinct from p_expected_version then
    raise exception 'El pedido cambio. Actualiza antes de guardar.' using errcode='40001';
  end if;
  if v_part.status='cancelled' or v_order.delivered_at is not null then raise exception 'El pedido u orden ya esta cerrado.' using errcode='23514'; end if;
  if p_action='install' and v_order.approval_status<>'accepted' then
    raise exception 'Registra una autorizacion vigente del cliente antes de utilizar repuestos.' using errcode='23514';
  end if;
  if p_action in ('order','reserve') and v_order.approval_status<>'accepted' and length(trim(coalesce(p_notes,'')))<3 then
    raise exception 'Falta autorizacion del cliente. Para una compra excepcional indica el motivo.' using errcode='23514';
  end if;
  if v_part.product_id is not null then
    select stock into strict v_stock from public.products where id=v_part.product_id for update;
  end if;
  if p_action='order' then
    if v_part.status<>'requested' then raise exception 'Este repuesto ya fue gestionado.' using errcode='23514'; end if;
    if length(trim(coalesce(p_supplier,'')))<2 then raise exception 'Indica el proveedor.' using errcode='23514'; end if;
    update public.repair_part_requests set status='ordered',supplier=p_supplier,unit_cost=p_unit_cost,expected_date=p_expected_date,buyer_id=auth.uid(),notes=nullif(p_notes,'') where id=p_id;
  elsif p_action in ('receive','reserve') then
    if p_quantity is null or p_quantity<=0 or v_part.received_quantity+p_quantity>v_part.quantity then raise exception 'La cantidad supera lo pendiente de recibir.' using errcode='23514'; end if;
    if p_action='receive' and v_part.status<>'ordered' then raise exception 'Primero registra la compra.' using errcode='23514'; end if;
    if v_part.product_id is not null then
      select coalesce(sum(reserved_quantity),0) into v_reserved from public.repair_part_requests where product_id=v_part.product_id;
      if p_action='reserve' and v_stock-v_reserved<p_quantity then raise exception 'No hay stock disponible para reservar.' using errcode='23514'; end if;
      if p_action='receive' then update public.products set stock=stock+p_quantity,updated_at=now() where id=v_part.product_id; end if;
    elsif p_action='reserve' then raise exception 'Vincula un producto para reservar stock existente.' using errcode='23514'; end if;
    update public.repair_part_requests set received_quantity=received_quantity+p_quantity,
      reserved_quantity=reserved_quantity+case when product_id is not null then p_quantity else 0 end,
      status=case when received_quantity+p_quantity=quantity then 'received' else status end where id=p_id;
  elsif p_action='install' then
    if p_quantity is null or p_quantity<=0 or v_part.installed_quantity+p_quantity>v_part.received_quantity then raise exception 'No podes utilizar partes que todavia no recibiste.' using errcode='23514'; end if;
    if v_part.product_id is not null then
      if v_stock<p_quantity or v_part.reserved_quantity<p_quantity then raise exception 'La reserva o stock no alcanza.' using errcode='23514'; end if;
      update public.repair_part_requests set reserved_quantity=reserved_quantity-p_quantity where id=p_id;
      update public.products set stock=stock-p_quantity,updated_at=now() where id=v_part.product_id;
    end if;
    update public.repair_part_requests set installed_quantity=installed_quantity+p_quantity,status=case when installed_quantity+p_quantity=quantity then 'installed' else status end where id=p_id;
  elsif p_action='cancel' then
    if v_part.installed_quantity>0 then raise exception 'Este pedido tiene partes utilizadas. Registra la devolucion mediante una correccion.' using errcode='23514'; end if;
    if length(trim(coalesce(p_notes,'')))<3 then raise exception 'Indica el motivo de cancelacion.' using errcode='23514'; end if;
    update public.repair_part_requests set status='cancelled',reserved_quantity=0,notes=p_notes where id=p_id;
  end if;
  update public.repair_part_requests set version=version+1,updated_at=now() where id=p_id;
  if not exists(select 1 from public.repair_part_requests where order_id=v_part.order_id and status not in ('cancelled','installed') and received_quantity<quantity) then
    update public.workshop_tasks set resolved_at=now(),resolved_by=auth.uid() where order_id=v_part.order_id and kind='parts' and resolved_at is null;
  end if;
  select status into v_status from public.repair_part_requests where id=p_id;
  insert into public.workshop_events(order_id,kind,message,actor_id)
    values(v_part.order_id,'part_update','Repuesto: '||v_part.description||' - '||p_action||case when p_quantity>0 then ' ('||p_quantity||')' else '' end,auth.uid());
  update public.repair_access_orders set updated_by=auth.uid(),updated_at=now() where id=v_part.order_id;
  return jsonb_build_object('id',p_id,'status',v_status);
end $$;

revoke all on function private.guard_workshop_order() from public,anon,authenticated;
revoke all on function private.workshop_decide(uuid,integer,uuid,text,text,text),
  private.workshop_save(uuid,integer,jsonb),private.workshop_manage_part(uuid,integer,text,integer,text,numeric,date,text) from public,anon;
grant execute on function private.workshop_decide(uuid,integer,uuid,text,text,text),
  private.workshop_save(uuid,integer,jsonb),private.workshop_manage_part(uuid,integer,text,integer,text,numeric,date,text) to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
