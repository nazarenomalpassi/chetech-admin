begin;
set local lock_timeout='5s';

-- Preserve an absent quote on ordinary technical updates instead of fabricating zero.
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
    budget_amount=case when is_paid then budget_amount else coalesce((p_payload->>'budget_amount')::numeric,budget_amount) end,
    budget_detail=case when p_payload ? 'budget_detail' then nullif(p_payload->>'budget_detail','') else budget_detail end,
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

create table private.workshop_quick_save_receipts (
  operation_id uuid primary key,
  order_id uuid not null references public.repair_access_orders(id),
  actor_id uuid not null,
  request_fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.workshop_quick_save_receipts enable row level security;
revoke all on private.workshop_quick_save_receipts from public,anon,authenticated;
create index workshop_quick_save_receipts_order_idx on private.workshop_quick_save_receipts(order_id);

create function private.workshop_save_quick(
  p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_payload jsonb,
  p_confirm_customer boolean,p_channel text,p_decision_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_order public.repair_access_orders%rowtype;
  v_receipt private.workshop_quick_save_receipts%rowtype;
  v_request jsonb;
  v_status text;
  v_result jsonb;
  v_amount numeric;
  v_confirm boolean:=coalesce(p_confirm_customer,false);
begin
  if v_actor is null or (select private.can_access_operations()) is not true then
    raise exception 'Sin permiso para actualizar la orden.' using errcode='42501';
  end if;
  if v_confirm and (select private.is_admin()) is not true then
    raise exception 'Solo mostrador puede registrar la decision del cliente.' using errcode='42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version<1
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then
    raise exception 'Revisa los datos de la actualizacion.' using errcode='23514';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) as k(key)
    where k.key not in ('status','budget_amount','budget_detail','repair_progress','quality_checked','quality_notes')) then
    raise exception 'Revisa los campos permitidos del seguimiento.' using errcode='23514';
  end if;
  if length(coalesce(p_decision_notes,''))>2000
    or (coalesce(p_channel,'')<>'' and p_channel not in ('presencial','telefono','whatsapp','portal'))
    or (v_confirm and coalesce(p_channel,'')='') then
    raise exception 'Revisa el canal y la respuesta del cliente.' using errcode='23514';
  end if;
  if (p_payload ? 'budget_amount' and jsonb_typeof(p_payload->'budget_amount')<>'number')
    or (p_payload ? 'quality_checked' and jsonb_typeof(p_payload->'quality_checked')<>'boolean')
    or exists(select 1 from jsonb_each(p_payload) e where e.key in ('status','budget_detail','repair_progress','quality_notes')
      and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2000)) then
    raise exception 'Revisa los tipos e importes del seguimiento.' using errcode='23514';
  end if;
  v_request:=jsonb_build_object('orderId',p_order_id,'expectedVersion',p_expected_version,'actorId',v_actor,
    'payload',p_payload,'confirmCustomer',v_confirm,'channel',coalesce(p_channel,''),'notes',coalesce(p_decision_notes,''));
  -- Bind the whole user action before any order mutation, including cross-order retries.
  perform pg_advisory_xact_lock(hashtextextended('workshop.quick:'||p_operation_id::text,0));
  select * into v_receipt from private.workshop_quick_save_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.request_fingerprint is distinct from v_request then
      raise exception 'La operacion ya existe con otro actor o solicitud; no se puede reutilizar.' using errcode='23514';
    end if;
    return v_receipt.result||jsonb_build_object('replayed',true);
  end if;
  select * into v_order from public.repair_access_orders where id=p_order_id for update;
  if not found then raise exception 'No se encontro la orden.' using errcode='P0002'; end if;
  if v_order.workflow_version is distinct from p_expected_version then
    raise exception 'La orden cambio en otro dispositivo. Actualiza antes de guardar.' using errcode='40001';
  end if;
  if v_order.delivered_at is not null or v_order.status='retirado' then
    raise exception 'La orden ya fue entregada. Revisa la ficha completa antes de corregirla.' using errcode='23514';
  end if;
  v_status:=coalesce(nullif(p_payload->>'status',''),v_order.status);
  v_amount:=case when p_payload ? 'budget_amount' then (p_payload->>'budget_amount')::numeric else v_order.budget_amount end;
  if p_payload ? 'budget_amount' and (v_amount<0 or v_amount>9999999999.99 or v_amount<>round(v_amount,2)) then
    raise exception 'Carga un importe no negativo con hasta dos decimales.' using errcode='23514';
  end if;
  if v_order.is_paid and p_payload ? 'budget_amount' and v_amount is distinct from v_order.budget_amount then
    raise exception 'El importe cobrado esta protegido. Registra una correccion desde cobros.' using errcode='23514';
  end if;
  if (v_confirm or v_status='listo_para_retirar') and (v_amount is null or v_amount<0
    or v_amount::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Carga un presupuesto valido antes de registrar la autorizacion del cliente.' using errcode='23514';
  end if;
  if v_confirm then
    -- Save the exact quote first; existing guards invalidate old approval and QC.
    perform private.workshop_save(p_order_id,p_expected_version,p_payload-'status'-'quality_checked');
    select * into strict v_order from public.repair_access_orders where id=p_order_id;
    if v_order.budget_amount is distinct from v_amount then
      raise exception 'El presupuesto guardado no coincide con el importe autorizado. Revisa la ficha.' using errcode='23514';
    end if;
    perform private.workshop_decide(p_order_id,v_order.workflow_version,p_operation_id,'accepted',p_channel,p_decision_notes);
    select * into strict v_order from public.repair_access_orders where id=p_order_id;
    if v_status='presupuestado' then v_status:='presupuestado_aceptado'; end if;
    perform private.workshop_save(p_order_id,v_order.workflow_version,jsonb_build_object(
      'status',v_status,'quality_checked',coalesce((p_payload->>'quality_checked')::boolean,false)));
  else
    perform private.workshop_save(p_order_id,p_expected_version,p_payload);
  end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id;
  if v_status='listo_para_retirar' and v_order.status is distinct from v_status then
    raise exception 'Registra una autorizacion vigente del cliente antes de marcar listo para retirar.' using errcode='23514';
  end if;
  -- Revalidate even inherited ready orders; a same-state edit must not bypass the guards.
  if v_order.status='listo_para_retirar' then
    if v_order.approval_status is distinct from 'accepted' or v_order.approved_at is null
      or v_order.approved_amount is distinct from v_order.budget_amount or not exists(
        select 1 from public.repair_customer_decisions d join public.repair_budget_versions b on b.id=d.budget_version_id
        where d.order_id=p_order_id and b.order_id=p_order_id and b.revision=v_order.budget_revision
          and d.decision='accepted' and b.amount=v_order.budget_amount
      ) then
      raise exception 'Registra una autorizacion vigente del cliente antes de marcar listo para retirar.' using errcode='23514';
    end if;
    if v_order.quality_checked_at is null then
      raise exception 'Completa el control de calidad antes de marcar listo para retirar.' using errcode='23514';
    end if;
    perform 1 from public.repair_part_requests where order_id=p_order_id order by id for update;
    if exists(select 1 from public.repair_part_requests where order_id=p_order_id and status<>'cancelled' and received_quantity<quantity) then
      raise exception 'Completa o cancela los repuestos pendientes antes de marcar listo para retirar.' using errcode='23514';
    end if;
  end if;
  v_result:=jsonb_build_object('id',p_order_id,'version',v_order.workflow_version,'status',v_order.status,'replayed',false);
  insert into private.workshop_quick_save_receipts(operation_id,order_id,actor_id,request_fingerprint,result)
    values(p_operation_id,p_order_id,v_actor,v_request,v_result);
  return v_result;
end $$;

create function public.workshop_save_quick(
  p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_payload jsonb,
  p_confirm_customer boolean,p_channel text,p_decision_notes text
) returns jsonb language sql security invoker set search_path='' as $$
  select private.workshop_save_quick(p_order_id,p_expected_version,p_operation_id,p_payload,p_confirm_customer,p_channel,p_decision_notes)
$$;
revoke all on function private.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text),
  public.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text) from public,anon;
grant execute on function private.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text),
  public.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
