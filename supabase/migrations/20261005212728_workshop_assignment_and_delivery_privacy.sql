begin;
set local lock_timeout='5s';

create or replace function private.get_workshop_context(p_order_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean := (select private.is_admin()); v_result jsonb;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para consultar el taller.' using errcode='42501'; end if;
  if coalesce(cardinality(p_order_ids),0)>100 then raise exception 'Consulta hasta 100 ordenes por pagina.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'version',o.workflow_version,'budgetRevision',o.budget_revision,'approvalStatus',o.approval_status,'approvedAmount',o.approved_amount,
    'assignedTechnicianId',o.technician_id,'assignedTechnicianName',coalesce(nullif(trim(assigned.full_name),''),o.technician_name),'location',o.physical_location,'nextActionDate',o.next_action_date,
    'qualityCheckedAt',o.quality_checked_at,'qualityNotes',o.quality_notes,
    'parts',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'orderId',r.order_id,'description',r.description,'quantity',r.quantity,'receivedQuantity',r.received_quantity,'installedQuantity',r.installed_quantity,'status',r.status,'priority',r.priority,'supplier',case when v_admin then r.supplier else null end,'expectedDate',r.expected_date,'notes',case when v_admin then r.notes else null end,'unitCost',case when v_admin then r.unit_cost else null end,'productId',r.product_id,'version',r.version,'createdAt',r.created_at) order by r.created_at),'[]'::jsonb) from public.repair_part_requests r where r.order_id=o.id),
    'events',(select coalesce(jsonb_agg(e.payload order by e.created_at desc),'[]'::jsonb) from (
      select jsonb_build_object('id',we.id,'kind',we.kind,'message',case when we.kind='delivery' then 'Entrega registrada por mostrador' else we.message end,'actorName',coalesce(p.full_name,'Sistema'),'createdAt',we.created_at) payload,we.created_at
      from public.workshop_events we left join public.profiles p on p.id=we.actor_id where we.order_id=o.id order by we.created_at desc limit 20) e)
  )),'[]'::jsonb) into v_result from public.repair_access_orders o left join public.profiles assigned on assigned.id=o.technician_id where o.id=any(p_order_ids);
  return v_result;
end $$;

create or replace function private.workshop_save(p_order_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_status text; v_tech public.profiles%rowtype;
  v_admin boolean := (select private.is_admin()); v_linked_name text; v_input_name text;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para actualizar la orden.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
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
    final_amount=case when is_paid then final_amount
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
    if new.quality_checked_at is null then raise exception 'Completa el control de calidad antes de marcar listo para retirar.' using errcode='23514'; end if;
    perform 1 from public.repair_part_requests where order_id=new.id order by id for update;
    if exists(select 1 from public.repair_part_requests where order_id=new.id and status<>'cancelled' and received_quantity<quantity) then
      raise exception 'Completa o cancela los repuestos pendientes antes de marcar listo para retirar.' using errcode='23514';
    end if;
  end if;
  new.workflow_version:=old.workflow_version+1; return new;
end $$;

create or replace function private.workshop_deliver(p_order_id uuid,p_expected_version integer,p_recipient text,p_notes text,p_allow_balance boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_delivered timestamptz; v_version integer;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo mostrador puede registrar la entrega.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.delivered_at is not null then return jsonb_build_object('id',p_order_id,'replayed',true); end if;
  if v_order.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio. Revisa el estado antes de entregarla.' using errcode='40001'; end if;
  if v_order.status not in ('listo_para_retirar','presupuestado_rechazado','sin_solucion') then raise exception 'La orden todavia no esta lista para entregar.' using errcode='23514'; end if;
  if length(trim(coalesce(p_recipient,'')))<2 then raise exception 'Indica quien retira el equipo.' using errcode='23514'; end if;
  if v_order.status='listo_para_retirar' and not v_order.is_paid and p_allow_balance is not true then raise exception 'Hay un cobro pendiente. Cobra o autoriza la entrega con saldo.' using errcode='23514'; end if;
  if p_allow_balance and length(trim(coalesce(p_notes,'')))<3 then raise exception 'Indica el motivo de entregar con saldo pendiente.' using errcode='23514'; end if;
  update public.repair_access_orders set status='retirado',picked_up_at=now(),delivered_at=now(),updated_by=auth.uid(),updated_at=now()
    where id=p_order_id returning delivered_at,workflow_version into v_delivered,v_version;
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
    values('repair_access_orders',p_order_id::text,'update',jsonb_build_object('operation','workshop_delivery','recipient',p_recipient,
      'notes',coalesce(p_notes,''),'allow_balance',coalesce(p_allow_balance,false),'was_paid',v_order.is_paid,
      'previous_status',v_order.status,'delivered_at',v_delivered,'order_version',v_version),auth.uid());
  insert into public.workshop_events(order_id,kind,message,actor_id) values(p_order_id,'delivery','Entrega registrada por mostrador',auth.uid());
  return jsonb_build_object('id',p_order_id);
end $$;

-- Preserve complete legacy messages privately before removing free text from ops.
-- Do not infer recipient/note boundaries in old strings: retain the original verbatim.
insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
select 'repair_access_orders',e.order_id::text,'update',jsonb_build_object('operation','workshop_delivery_legacy_redaction',
  'delivery_event_id',e.id,'legacy_message',e.message,'event_created_at',e.created_at),e.actor_id
from public.workshop_events e where e.kind='delivery' and e.message<>'Entrega registrada por mostrador'
  and not exists(select 1 from public.audit_logs a where a.entity_type='repair_access_orders' and a.entity_id=e.order_id::text
    and a.changes->>'operation'='workshop_delivery_legacy_redaction' and a.changes->>'delivery_event_id'=e.id::text);
update public.workshop_events set message='Entrega registrada por mostrador' where kind='delivery' and message<>'Entrega registrada por mostrador';

-- Run the legacy technician boundary after the workflow/assignment guards have
-- derived their metadata; protected fields are validated, not merely allowlisted.
create or replace function private.enforce_technician_repair_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  editable text[]:=array['status','technical_diagnosis','repair_progress','internal_observations','used_parts','work_performed',
    'budget_amount','budget_detail','final_amount','budgeted_at','technician_name','technician_id','public_progress','public_next_step',
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
drop trigger if exists enforce_technician_repair_update on public.repair_access_orders;
drop trigger if exists zzz_technician_repair_update on public.repair_access_orders;
create trigger zzz_technician_repair_update before update on public.repair_access_orders
  for each row execute function private.enforce_technician_repair_update();

revoke all on function private.guard_workshop_order(),private.enforce_technician_repair_update() from public,anon,authenticated;
revoke all on function private.get_workshop_context(uuid[]),private.workshop_save(uuid,integer,jsonb),private.workshop_deliver(uuid,integer,text,text,boolean) from public,anon;
grant execute on function private.get_workshop_context(uuid[]),private.workshop_save(uuid,integer,jsonb),private.workshop_deliver(uuid,integer,text,text,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
