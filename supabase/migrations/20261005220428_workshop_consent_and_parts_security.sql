begin;
set local lock_timeout='5s';

-- Original requests can have been managed/edited already. Never infer historical fingerprints.
alter table public.repair_part_requests add column if not exists request_fingerprint jsonb;

-- Technical proposals cannot set or clear the separate, authoritative final financial price.
create or replace function private.workshop_save(p_order_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_status text; v_tech public.profiles%rowtype;
  v_admin boolean := (select private.is_admin()); v_linked_name text; v_input_name text;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para actualizar la orden.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
  if v_admin is not true and p_payload ? 'final_amount' then
    raise exception 'El importe final financiero se registra desde mostrador.' using errcode='42501';
  end if;
  v_status:=coalesce(nullif(p_payload->>'status',''),v_order.status);
  if v_status in ('presupuestado_aceptado','presupuestado_rechazado','retirado') and v_status<>v_order.status then raise exception 'Usa la accion de confirmacion del cliente o de entrega.' using errcode='23514'; end if;
  if p_payload ? 'technician_id' then
    if v_admin is not true then raise exception 'La asignacion se realiza desde mostrador.' using errcode='42501'; end if;
    if nullif(p_payload->>'technician_id','') is not null then
      if (p_payload->>'technician_id')::uuid is distinct from v_order.technician_id then
        select * into v_tech from public.profiles where id=(p_payload->>'technician_id')::uuid and role='tecnico' and account_status='active';
        if not found then raise exception 'Selecciona una cuenta de tecnico activa.' using errcode='23514'; end if;
      else v_tech.full_name:=v_order.technician_name;
      end if;
    end if;
  end if;
  if v_order.technician_id is not null and p_payload ? 'technician_name' and v_admin is not true and v_order.technician_id<>auth.uid() then
    select full_name into v_linked_name from public.profiles where id=v_order.technician_id;
    v_input_name:=nullif(trim(p_payload->>'technician_name'),'');
    if v_input_name is distinct from nullif(trim(v_order.technician_name),'')
      and v_input_name is distinct from coalesce(nullif(trim(v_linked_name),''),nullif(trim(v_order.technician_name),'')) then
      raise exception 'No podes cambiar el nombre de otra cuenta asignada.' using errcode='42501';
    end if;
  end if;
  if v_admin is not true and (p_payload ? 'is_paid' or p_payload ? 'picked_up_at' or p_payload ? 'delivered_at') then raise exception 'El cobro y la entrega se realizan desde mostrador.' using errcode='42501'; end if;
  update public.repair_access_orders set
    status=v_status,
    budget_amount=case when is_paid then budget_amount else coalesce((p_payload->>'budget_amount')::numeric,budget_amount,0) end,
    budget_detail=case when p_payload ? 'budget_detail' then nullif(p_payload->>'budget_detail','') else budget_detail end,
    -- A changed quote is an estimate, not a replacement final invoice price.
    final_amount=case when v_admin is not true then final_amount when is_paid then final_amount
      when p_payload ? 'final_amount' then nullif(p_payload->>'final_amount','')::numeric
      when ((p_payload ? 'budget_amount' and (p_payload->>'budget_amount')::numeric is distinct from budget_amount)
        or (p_payload ? 'budget_detail' and nullif(p_payload->>'budget_detail','') is distinct from budget_detail)) then null
      else final_amount end,
    technical_diagnosis=case when p_payload ? 'technical_diagnosis' then nullif(p_payload->>'technical_diagnosis','') else technical_diagnosis end,
    repair_progress=case when p_payload ? 'repair_progress' then nullif(p_payload->>'repair_progress','') else repair_progress end,
    internal_observations=case when p_payload ? 'internal_observations' then nullif(p_payload->>'internal_observations','') else internal_observations end,
    work_performed=case when p_payload ? 'work_performed' then nullif(p_payload->>'work_performed','') else work_performed end,
    used_parts=case when p_payload ? 'used_parts' then nullif(p_payload->>'used_parts','') else used_parts end,
    technician_id=case when p_payload ? 'technician_id' then nullif(p_payload->>'technician_id','')::uuid else technician_id end,
    technician_name=case when p_payload ? 'technician_id' and nullif(p_payload->>'technician_id','') is not null then v_tech.full_name
      when p_payload ? 'technician_id' or technician_id is not null then technician_name
      when p_payload ? 'technician_name' then nullif(p_payload->>'technician_name','') else technician_name end,
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
    insert into public.repair_access_status_history(repair_order_id,previous_status,next_status,changed_by,notes) values(p_order_id,v_order.status,v_status,auth.uid(),p_payload->>'repair_progress');
  end if;
  return jsonb_build_object('id',p_order_id);
end $$;

-- Legacy work may continue, but readiness always needs current, recorded acceptance.
create or replace function private.guard_workshop_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and (select private.is_technician()) and new.status in ('presupuestado_aceptado','presupuestado_rechazado','retirado') then
    raise exception 'La aprobacion del cliente y la entrega se registran desde mostrador.' using errcode='42501';
  end if;
  if (new.budget_amount,new.budget_detail) is distinct from (old.budget_amount,old.budget_detail) then
    if old.is_paid and new.budget_amount is distinct from old.budget_amount then raise exception 'El importe cobrado esta protegido. Registra una correccion desde cobros.' using errcode='23514'; end if;
    new.budget_revision:=old.budget_revision+1; new.approval_status:='pending'; new.approved_amount:=null; new.approved_at:=null;
    -- Even an echoed checked=true belongs to the previous scope, not the new quote.
    new.quality_checked_at:=null; new.quality_checked_by:=null;
    if old.approval_status='accepted' then new.status:='presupuestado'; end if;
  elsif new.approval_status is not distinct from old.approval_status then new.budget_response_at:=old.budget_response_at;
  end if;
  if new.status in ('en_reparacion','en_pruebas') and new.status is distinct from old.status and new.approval_status<>'accepted'
    and not (old.approval_status='legacy' and new.approval_status='legacy' and old.status in ('en_reparacion','en_pruebas')) then
    raise exception 'Primero registra la autorizacion del cliente.' using errcode='23514';
  end if;
  if new.status='listo_para_retirar' and new.status is distinct from old.status then
    if new.approval_status is distinct from 'accepted' or new.approved_at is null
      or new.approved_amount is null or not exists(
        select 1 from public.repair_customer_decisions d join public.repair_budget_versions b on b.id=d.budget_version_id
        where d.order_id=new.id and b.order_id=new.id and b.revision=new.budget_revision and d.decision='accepted'
      ) then
      raise exception 'Registra una autorizacion vigente del cliente antes de marcar listo para retirar.' using errcode='23514';
    end if;
    if new.quality_checked_at is null then raise exception 'Completa el control de calidad antes de marcar listo para retirar.' using errcode='23514'; end if;
    perform 1 from public.repair_part_requests where order_id=new.id order by id for update;
    if exists(select 1 from public.repair_part_requests where order_id=new.id and status<>'cancelled' and received_quantity<quantity) then
      raise exception 'Completa o cancela los repuestos pendientes antes de marcar listo para retirar.' using errcode='23514';
    end if;
  end if;
  new.workflow_version:=old.workflow_version+1; return new;
end $$;

-- Final price is intentionally absent from technical editable/derived columns.
create or replace function private.enforce_technician_repair_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  editable text[]:=array['status','technical_diagnosis','repair_progress','internal_observations','used_parts','work_performed',
    'budget_amount','budget_detail','budgeted_at','technician_name','technician_id','public_progress','public_next_step',
    'budget_visible_to_customer','public_budget_description','budget_valid_until','customer_action_required','last_customer_visible_update_at',
    'physical_location','next_action_date','quality_notes','updated_by','updated_at'];
  derived text[]:=array['workflow_version','budget_revision','approval_status','approved_amount','approved_at','budget_response_at',
    'quality_checked_at','quality_checked_by','reviewed_at','repair_started_at','finished_at'];
  quote_changed boolean:=(new.budget_amount,new.budget_detail) is distinct from (old.budget_amount,old.budget_detail);
begin
  if (select private.is_technician()) is not true then return new; end if;
  if (to_jsonb(new)-editable-derived) is distinct from (to_jsonb(old)-editable-derived) then
    raise exception 'El rol tecnico no puede modificar datos administrativos de la orden.' using errcode='42501';
  end if;
  if old.is_paid and (new.budget_amount,new.final_amount) is distinct from (old.budget_amount,old.final_amount) then
    raise exception 'El monto queda protegido porque la orden ya fue cobrada.' using errcode='42501';
  end if;
  if new.updated_by is distinct from auth.uid() then raise exception 'La actualizacion tecnica debe identificar al usuario actual.' using errcode='42501'; end if;
  if new.workflow_version is distinct from old.workflow_version+1
    or new.budget_revision is distinct from (old.budget_revision+case when quote_changed then 1 else 0 end)
    or new.approval_status is distinct from (case when quote_changed then 'pending' else old.approval_status end)
    or new.approved_amount is distinct from (case when quote_changed then null else old.approved_amount end)
    or new.approved_at is distinct from (case when quote_changed then null else old.approved_at end)
    or new.budget_response_at is distinct from old.budget_response_at then
    raise exception 'La autorizacion y version solo pueden cambiar por sus guardas de flujo.' using errcode='42501';
  end if;
  if (new.reviewed_at is distinct from old.reviewed_at and new.reviewed_at is distinct from case when new.status='en_revision' then coalesce(old.reviewed_at,now()) else old.reviewed_at end)
    or (new.repair_started_at is distinct from old.repair_started_at and new.repair_started_at is distinct from case when new.status='en_reparacion' then coalesce(old.repair_started_at,now()) else old.repair_started_at end)
    or (new.finished_at is distinct from old.finished_at and new.finished_at is distinct from case when new.status='listo_para_retirar' then coalesce(old.finished_at,now()) else old.finished_at end)
    or (new.budgeted_at is distinct from old.budgeted_at and new.budgeted_at is distinct from case when coalesce(new.budget_amount,0)>0 then coalesce(old.budgeted_at,now()) else old.budgeted_at end) then
    raise exception 'Las fechas de trabajo deben corresponder a la transicion registrada.' using errcode='42501';
  end if;
  if quote_changed then
    if new.quality_checked_at is not null or new.quality_checked_by is not null then raise exception 'El nuevo alcance requiere otro control de calidad.' using errcode='42501'; end if;
  elsif old.quality_checked_at is not null then
    if (new.quality_checked_at,new.quality_checked_by) is distinct from (old.quality_checked_at,old.quality_checked_by) then
      raise exception 'El control existente no se reescribe en una actualizacion tecnica.' using errcode='42501';
    end if;
  elsif new.quality_checked_at is null then
    if new.quality_checked_by is distinct from old.quality_checked_by then raise exception 'El control de calidad debe identificar una comprobacion real.' using errcode='42501'; end if;
  elsif new.quality_checked_at is distinct from now() or new.quality_checked_by is distinct from auth.uid() then
    raise exception 'El control de calidad debe identificar al tecnico y momento actual.' using errcode='42501';
  end if;
  return new;
end $$;

-- Existing admin decision API supports explicit zero-price scope plus an explicit reason.
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
  if p_decision='accepted' then
    if v_order.budget_amount is null or v_order.budget_amount<0 then
      raise exception 'Carga un importe explicito no negativo antes de autorizar.' using errcode='23514';
    end if;
    if v_order.budget_amount=0 and (length(trim(coalesce(v_order.budget_detail,'')))<3 or length(trim(coalesce(p_notes,'')))<3) then
      raise exception 'La autorizacion sin cargo requiere alcance detallado y motivo explicito de mostrador.' using errcode='23514';
    end if;
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

create or replace function private.workshop_request_part(
  p_order_id uuid,p_operation_id uuid,p_description text,p_quantity integer,p_priority text,p_notes text,p_product_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_order public.repair_access_orders%rowtype; v_receipt public.repair_part_requests%rowtype; v_id uuid;
  v_request jsonb:=jsonb_build_object('orderId',p_order_id,'actorId',v_actor,'description',p_description,
    'quantity',p_quantity,'priority',p_priority,'notes',coalesce(p_notes,''),'productId',p_product_id);
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para solicitar repuestos.' using errcode='42501'; end if;
  if p_operation_id is null then raise exception 'Indica una identidad de operacion.' using errcode='23514'; end if;
  -- Same order -> part -> product ordering as management; serialize retries first.
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  select * into v_receipt from public.repair_part_requests where operation_id=p_operation_id;
  if found then
    if v_receipt.order_id is distinct from p_order_id or v_receipt.requested_by is distinct from v_actor
      or v_receipt.request_fingerprint is distinct from v_request then
      raise exception 'La operacion de repuesto ya existe con otro actor o solicitud, o no tiene una huella verificable.' using errcode='23514';
    end if;
    return jsonb_build_object('id',v_receipt.id,'replayed',true);
  end if;
  if v_order.delivered_at is not null or v_order.status='retirado' then raise exception 'La orden ya fue entregada.' using errcode='23514'; end if;
  if v_order.status='listo_para_retirar' then raise exception 'Reabre la orden antes de solicitar nuevos repuestos.' using errcode='23514'; end if;
  if p_description is null or length(trim(p_description)) not between 3 and 500
    or p_quantity is null or p_quantity not between 1 and 10000
    or p_priority is null or p_priority not in ('normal','alta','urgente') then
    raise exception 'Revisa descripcion, cantidad y prioridad del repuesto.' using errcode='23514';
  end if;
  insert into public.repair_part_requests(operation_id,order_id,description,quantity,priority,requested_by,notes,product_id,request_fingerprint)
    values(p_operation_id,p_order_id,trim(p_description),p_quantity,p_priority,v_actor,nullif(p_notes,''),p_product_id,v_request)
    on conflict(operation_id) do nothing returning id into v_id;
  if not found then raise exception 'La operacion de repuesto ya fue usada por otra solicitud.' using errcode='23514'; end if;
  insert into public.workshop_tasks(order_id,kind,title) values(p_order_id,'parts','Gestionar repuestos solicitados') on conflict do nothing;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(p_order_id,'part_request','Repuesto solicitado: '||trim(p_description)||' ('||p_quantity||')',v_actor);
  update public.repair_access_orders set updated_by=v_actor,updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',v_id);
end $$;

revoke all on function private.guard_workshop_order(),private.enforce_technician_repair_update() from public,anon,authenticated;
revoke all on function private.workshop_save(uuid,integer,jsonb),private.workshop_decide(uuid,integer,uuid,text,text,text),
  private.workshop_request_part(uuid,uuid,text,integer,text,text,uuid) from public,anon;
grant execute on function private.workshop_save(uuid,integer,jsonb),private.workshop_decide(uuid,integer,uuid,text,text,text),
  private.workshop_request_part(uuid,uuid,text,integer,text,text,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
