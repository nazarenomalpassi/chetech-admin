begin;
-- Production migration version assigned by Supabase on 2026-10-21.
set local lock_timeout='5s';

-- A staff attestation does not imply a phone call, an in-person visit or portal consent.
alter table public.repair_customer_decisions drop constraint repair_customer_decisions_channel_check;
alter table public.repair_customer_decisions add constraint repair_customer_decisions_channel_check
  check(channel in ('presencial','telefono','whatsapp','portal','registro'));

-- Replace only known fragments in the current definitions, preserving signatures,
-- ownership, ACLs, consent/QC guards and the no-fault preservation patch.
do $patch$
declare definition text; signature text; old_fragment text; new_fragment text;
begin
  foreach signature in array array['private.workshop_decide(uuid,integer,uuid,text,text,text)',
    'private.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text)'] loop
    definition:=pg_get_functiondef(to_regprocedure(signature));
    old_fragment:='p_channel not in (''presencial'',''telefono'',''whatsapp'',''portal'')';
    new_fragment:='p_channel not in (''presencial'',''telefono'',''whatsapp'',''portal'',''registro'')';
    if strpos(definition,old_fragment)=0 then raise exception 'Unexpected decision channel definition: %',signature; end if;
    definition:=replace(definition,old_fragment,new_fragment);
    if signature like '%save_quick%' then
      definition:=replace(definition,'''budget_amount''-''budget_detail''-''final_amount''-''quality_checked''',
        '''budget_amount''-''budget_detail''-''final_amount''-''quality_checked''-''has_warranty''-''warranty_days''-''warranty_conditions''');
      old_fragment:='''status'',''budget_amount'',''budget_detail'',''repair_progress'',''quality_checked'',''quality_notes''';
      if strpos(definition,old_fragment)=0 then raise exception 'Unexpected quick-save allowed fields.'; end if;
      definition:=replace(definition,old_fragment,old_fragment||',''has_warranty'',''warranty_days'',''warranty_conditions''');
      old_fragment:=E'  v_request:=jsonb_build_object(';
      if strpos(definition,old_fragment)=0 then raise exception 'Unexpected quick-save request anchor.'; end if;
      new_fragment:=$validation$
  if p_payload ?| array['has_warranty','warranty_days','warranty_conditions'] then
    if (select private.is_admin()) is not true then
      raise exception 'La garantia se configura desde administracion.' using errcode='42501';
    end if;
    if (p_payload ? 'has_warranty' and jsonb_typeof(p_payload->'has_warranty')<>'boolean')
      or (p_payload ? 'warranty_days' and (jsonb_typeof(p_payload->'warranty_days')<>'number'
        or (p_payload->>'warranty_days')::numeric<>trunc((p_payload->>'warranty_days')::numeric)
        or (p_payload->>'warranty_days')::numeric not between 0 and 3650))
      or (p_payload ? 'warranty_conditions' and (jsonb_typeof(p_payload->'warranty_conditions')<>'string'
        or length(p_payload->>'warranty_conditions')>2000)) then
      raise exception 'Revisa la configuracion de garantia.' using errcode='23514';
    end if;
  end if;
  v_request:=jsonb_build_object($validation$;
      definition:=replace(definition,old_fragment,new_fragment);
    end if;
    execute definition;
  end loop;
  definition:=pg_get_functiondef('private.workshop_save(uuid,integer,jsonb)'::regprocedure);
  definition:=replace(definition,'''budget_amount''-''budget_detail''-''final_amount''-''quality_checked''',
    '''budget_amount''-''budget_detail''-''final_amount''-''quality_checked''-''has_warranty''-''warranty_days''-''warranty_conditions''');
  old_fragment:='  v_status:=coalesce(nullif(p_payload->>''status'',''''),v_order.status);';
  if strpos(definition,old_fragment)=0 then raise exception 'Unexpected workshop status definition.'; end if;
  execute replace(definition,old_fragment,$guard$
  if v_order.delivered_at is not null or v_order.status='retirado' then
    raise exception 'La orden ya fue entregada. Usa la correccion de garantia o registra un reingreso, sin reabrir la orden.' using errcode='23514';
  end if;
$guard$||old_fragment);
end;
$patch$;

create function private.workshop_warranty_correct(p_order_id uuid,p_expected_version integer,p_operation_id uuid,
  p_has_warranty boolean,p_warranty_days integer,p_conditions text,p_reason text,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.repair_access_orders%rowtype; v_after public.repair_access_orders%rowtype;
  r private.workshop_warranty_receipts%rowtype; v_request jsonb; v_result jsonb;
begin
  if auth.uid() is null or (select private.is_admin()) is not true then
    raise exception 'Solo administracion puede corregir la garantia.' using errcode='42501';
  end if;
  if p_order_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<1
    or p_has_warranty is null or p_warranty_days is null or p_warranty_days not between 0 and 3650
    or (p_has_warranty and p_warranty_days=0) or (not p_has_warranty and p_warranty_days<>0)
    or length(coalesce(p_conditions,''))>2000 or length(trim(coalesce(p_reason,''))) not between 3 and 2000
    or p_confirm is not true then
    raise exception 'Indica garantia, dias, motivo y confirmacion de la correccion.' using errcode='23514';
  end if;
  v_request:=jsonb_build_object('kind','correction','actor',auth.uid(),'order',p_order_id,'version',p_expected_version,
    'hasWarranty',p_has_warranty,'days',p_warranty_days,'conditions',coalesce(p_conditions,''),'reason',trim(p_reason),'confirm',p_confirm);
  perform pg_advisory_xact_lock(hashtextextended('workshop.warranty:'||p_operation_id::text,0));
  select * into r from private.workshop_warranty_receipts where operation_id=p_operation_id;
  if found then
    if r.request_fingerprint is distinct from v_request then raise exception 'Esta operacion ya se uso con otros datos.' using errcode='23514'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into o from public.repair_access_orders where id=p_order_id for update;
  if not found then raise exception 'No se encontro la orden.' using errcode='P0002'; end if;
  if o.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza la ficha.' using errcode='40001'; end if;
  if o.status<>'retirado' and o.delivered_at is null then
    raise exception 'Configura la garantia desde Actualizar trabajo antes de la entrega.' using errcode='23514';
  end if;
  if o.picked_up_at is null or o.picked_up_at>now() then
    raise exception 'Falta una fecha valida del retiro original. No se inicia la garantia con la fecha de hoy.' using errcode='23514';
  end if;
  -- The existing warranty trigger derives dates from the immutable original pickup.
  update public.repair_access_orders set has_warranty=p_has_warranty,warranty_days=p_warranty_days,
    warranty_conditions=nullif(p_conditions,''),updated_by=auth.uid(),updated_at=now()
    where id=p_order_id returning * into v_after;
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id) values('repair_access_orders',p_order_id::text,'update',
    jsonb_build_object('operation','warranty_correction','before',to_jsonb(o),'after',to_jsonb(v_after),'request',v_request),auth.uid());
  insert into public.workshop_events(order_id,kind,message,actor_id,order_version) values(p_order_id,'warranty',
    'Correccion de garantia desde el retiro original: '||trim(p_reason),auth.uid(),v_after.workflow_version);
  v_result:=jsonb_build_object('id',p_order_id,'version',v_after.workflow_version,'replayed',false);
  insert into private.workshop_warranty_receipts(operation_id,request_fingerprint,result) values(p_operation_id,v_request,v_result);
  return v_result;
end $$;

create function public.workshop_warranty_correct(p_order_id uuid,p_expected_version integer,p_operation_id uuid,
  p_has_warranty boolean,p_warranty_days integer,p_conditions text,p_reason text,p_confirm boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select private.workshop_warranty_correct(p_order_id,p_expected_version,p_operation_id,p_has_warranty,p_warranty_days,p_conditions,p_reason,p_confirm)
$$;
revoke all on function private.workshop_warranty_correct(uuid,integer,uuid,boolean,integer,text,text,boolean),
  public.workshop_warranty_correct(uuid,integer,uuid,boolean,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function private.workshop_warranty_correct(uuid,integer,uuid,boolean,integer,text,text,boolean),
  public.workshop_warranty_correct(uuid,integer,uuid,boolean,integer,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
