begin;
set local lock_timeout='5s';

-- Two decisions in one transaction must retain their real insertion order.
-- Existing timestamps are unchanged; reports continue using created_at.
alter table public.repair_customer_decisions alter column created_at set default clock_timestamp();

-- Keep the existing atomic RPC contract. Explicit response states choose the
-- customer decision when p_confirm_customer is true; ordinary saves cannot.
create or replace function private.workshop_save_quick(
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
  v_decision text;
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
    raise exception 'Carga un presupuesto valido antes de registrar la respuesta del cliente.' using errcode='23514';
  end if;
  if v_confirm then
    v_decision:=case when v_status='presupuestado_rechazado' then 'rejected' else 'accepted' end;
    perform private.workshop_save(p_order_id,p_expected_version,p_payload-'status'-'quality_checked');
    select * into strict v_order from public.repair_access_orders where id=p_order_id;
    if v_order.budget_amount is distinct from v_amount then
      raise exception 'El presupuesto guardado no coincide con el importe respondido. Revisa la ficha.' using errcode='23514';
    end if;
    if v_decision='rejected' and v_order.approval_status='accepted' then
      if length(trim(coalesce(p_decision_notes,'')))<3 then
        raise exception 'Indica el motivo del rechazo para dejar registrada la revocacion de la aceptacion anterior.' using errcode='23514';
      end if;
      perform private.workshop_decide(p_order_id,v_order.workflow_version,gen_random_uuid(),'revoked',p_channel,p_decision_notes);
      select * into strict v_order from public.repair_access_orders where id=p_order_id;
    end if;
    -- Keeping the same authorized quote does not manufacture a second consent.
    if v_order.approval_status is distinct from v_decision then
      perform private.workshop_decide(p_order_id,v_order.workflow_version,p_operation_id,v_decision,p_channel,p_decision_notes);
      select * into strict v_order from public.repair_access_orders where id=p_order_id;
    end if;
    if v_status='presupuestado' then v_status:='presupuestado_aceptado'; end if;
    if v_status in ('presupuestado_aceptado','presupuestado_rechazado') and v_order.status is distinct from v_status then
      update public.repair_access_orders set status=v_status,updated_by=v_actor,updated_at=now() where id=p_order_id;
      select * into strict v_order from public.repair_access_orders where id=p_order_id;
    end if;
    perform private.workshop_save(p_order_id,v_order.workflow_version,jsonb_build_object(
      'status',v_status,'quality_checked',coalesce((p_payload->>'quality_checked')::boolean,false)));
  else
    perform private.workshop_save(p_order_id,p_expected_version,p_payload);
  end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id;
  if v_status='listo_para_retirar' and v_order.status is distinct from v_status then
    raise exception 'Registra una autorizacion vigente del cliente antes de marcar listo para retirar.' using errcode='23514';
  end if;
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

notify pgrst,'reload schema';
commit;
