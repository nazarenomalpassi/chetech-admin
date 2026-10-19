begin;
set local lock_timeout='5s';

alter table public.repair_access_orders drop constraint repair_access_orders_status_check;
alter table public.repair_access_orders add constraint repair_access_orders_status_check check
  (status in ('pendiente_revision','en_revision','presupuestado','presupuestado_aceptado','presupuestado_rechazado','en_reparacion','en_pruebas','listo_para_retirar','retirado','sin_solucion','no_presenta_fallas'));
alter table public.repair_access_status_history drop constraint repair_access_status_history_next_status_check;
alter table public.repair_access_status_history add constraint repair_access_status_history_next_status_check check
  (next_status in ('pendiente_revision','en_revision','presupuestado','presupuestado_aceptado','presupuestado_rechazado','en_reparacion','en_pruebas','listo_para_retirar','retirado','sin_solucion','no_presenta_fallas'));

create table public.repair_warranty_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.repair_access_orders(id),
  received_on date not null,
  issue_reported text not null check(length(trim(issue_reported)) between 3 and 2000),
  accessories text not null default '' check(length(accessories)<=2000),
  condition_notes text not null default '' check(length(condition_notes)<=2000),
  status text not null default 'pendiente_revision' check(status in ('pendiente_revision','en_revision','en_reparacion','en_pruebas','listo_para_retirar','no_presenta_fallas','sin_solucion','retirado')),
  progress text not null default '' check(length(progress)<=2000),
  resolution text not null default '' check(length(resolution)<=2000),
  recipient text check(length(recipient)<=2000),
  closed_at timestamptz,
  version integer not null default 1 check(version>0),
  original_delivery_at timestamptz not null,
  warranty_start_snapshot date,
  warranty_until_snapshot date,
  coverage_acknowledged boolean not null default false,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='retirado')=(closed_at is not null)),
  check (closed_at is null or length(trim(recipient))>=2)
);
create unique index repair_warranty_one_active on public.repair_warranty_returns(order_id) where closed_at is null;
create index repair_warranty_order_history on public.repair_warranty_returns(order_id,created_at desc,id desc);
create index repair_warranty_queue on public.repair_warranty_returns(received_on desc,created_at desc,id desc) where closed_at is null;
create index repair_warranty_closed on public.repair_warranty_returns(closed_at desc,id desc) where closed_at is not null;
alter table public.repair_warranty_returns enable row level security;
revoke all on public.repair_warranty_returns from public,anon,authenticated;
grant select on public.repair_warranty_returns to authenticated;
create policy warranty_admin_read on public.repair_warranty_returns for select to authenticated using((select private.is_admin()));
grant all on public.repair_warranty_returns to service_role;

create table private.workshop_warranty_receipts (
  operation_id uuid primary key,
  request_fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.workshop_warranty_receipts from public,anon,authenticated;

create function private.workshop_warranty_start(p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_received_on date,p_issue text,p_accessories text,p_condition_notes text,p_acknowledge_coverage boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.repair_access_orders%rowtype; r private.workshop_warranty_receipts%rowtype;
  v_request jsonb; v_result jsonb; v_id uuid; v_delivery timestamptz;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede registrar un reingreso por garantia.' using errcode='42501'; end if;
  if p_order_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<1
    or p_received_on is null or p_received_on>v_today or length(trim(coalesce(p_issue,''))) not between 3 and 2000
    or length(coalesce(p_accessories,''))>2000 or length(coalesce(p_condition_notes,''))>2000 then
    raise exception 'Revisa la fecha y el motivo del reingreso.' using errcode='23514';
  end if;
  v_request:=jsonb_build_object('kind','start','actor',auth.uid(),'order',p_order_id,'version',p_expected_version,'receivedOn',p_received_on,
    'issue',p_issue,'accessories',coalesce(p_accessories,''),'condition',coalesce(p_condition_notes,''),'ack',coalesce(p_acknowledge_coverage,false));
  perform pg_advisory_xact_lock(hashtextextended('workshop.warranty:'||p_operation_id::text,0));
  select * into r from private.workshop_warranty_receipts where operation_id=p_operation_id;
  if found then
    if r.request_fingerprint is distinct from v_request then raise exception 'Esta operacion ya se uso con otros datos.' using errcode='23514'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into o from public.repair_access_orders where id=p_order_id for update;
  if not found then raise exception 'No se encontro la orden.' using errcode='P0002'; end if;
  if o.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza la ficha.' using errcode='40001'; end if;
  if o.status<>'retirado' and o.delivered_at is null then raise exception 'El reingreso se registra sobre una orden que ya fue retirada.' using errcode='23514'; end if;
  v_delivery:=coalesce(o.delivered_at,o.picked_up_at);
  if v_delivery is null then raise exception 'Falta la fecha del retiro original. Revisa la entrega antes del reingreso.' using errcode='23514'; end if;
  if p_received_on<(v_delivery at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'El reingreso no puede ser anterior al retiro original.' using errcode='23514'; end if;
  if exists(select 1 from public.repair_warranty_returns where order_id=p_order_id and closed_at is null) then raise exception 'Esta orden ya tiene un reingreso por garantia abierto. Actualiza ese seguimiento.' using errcode='23514'; end if;
  if exists(select 1 from public.repair_warranty_returns where order_id=p_order_id
    and p_received_on<(closed_at at time zone 'America/Argentina/Buenos_Aires')::date) then
    raise exception 'El reingreso no puede ser anterior al retiro de la visita de garantia anterior.' using errcode='23514';
  end if;
  if (not coalesce(o.has_warranty,false) or o.warranty_start is null or o.warranty_until is null
    or p_received_on<o.warranty_start or p_received_on>o.warranty_until or coalesce(o.warranty_requires_review,false)) and p_acknowledge_coverage is not true then
    raise exception 'Confirma la recepcion excepcional: la garantia no figura vigente para esa fecha. No se ampliara su cobertura automaticamente.' using errcode='23514';
  end if;
  insert into public.repair_warranty_returns(order_id,received_on,issue_reported,accessories,condition_notes,original_delivery_at,
    warranty_start_snapshot,warranty_until_snapshot,coverage_acknowledged,created_by,updated_by)
    values(p_order_id,p_received_on,trim(p_issue),coalesce(p_accessories,''),coalesce(p_condition_notes,''),v_delivery,
      o.warranty_start,o.warranty_until,coalesce(p_acknowledge_coverage,false),auth.uid(),auth.uid()) returning id into v_id;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(p_order_id,'warranty','Reingreso por garantia: '||trim(p_issue),auth.uid());
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
    values('repair_warranty_returns',v_id::text,'insert',v_request,auth.uid());
  v_result:=jsonb_build_object('id',v_id,'version',1,'status','pendiente_revision','replayed',false);
  insert into private.workshop_warranty_receipts(operation_id,request_fingerprint,result) values(p_operation_id,v_request,v_result);
  return v_result;
end $$;

create function private.workshop_warranty_save(p_return_id uuid,p_expected_version integer,p_operation_id uuid,p_status text,p_progress text,p_resolution text,p_recipient text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.repair_warranty_returns%rowtype; r private.workshop_warranty_receipts%rowtype;
  v_request jsonb; v_result jsonb; v_version integer; v_resolution text;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para actualizar garantias.' using errcode='42501'; end if;
  if p_status='retirado' and (select private.is_admin()) is not true then raise exception 'El retiro se registra desde administracion.' using errcode='42501'; end if;
  if p_return_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<1 or p_status is null
    or p_status not in ('pendiente_revision','en_revision','en_reparacion','en_pruebas','listo_para_retirar','no_presenta_fallas','sin_solucion','retirado')
    or length(coalesce(p_progress,''))>2000 or length(coalesce(p_resolution,''))>2000 or length(coalesce(p_recipient,''))>2000 then
    raise exception 'Revisa el estado y los datos del seguimiento.' using errcode='23514';
  end if;
  v_request:=jsonb_build_object('kind','save','actor',auth.uid(),'return',p_return_id,'version',p_expected_version,'status',p_status,
    'progress',coalesce(p_progress,''),'resolution',coalesce(p_resolution,''),'recipient',coalesce(p_recipient,''));
  perform pg_advisory_xact_lock(hashtextextended('workshop.warranty:'||p_operation_id::text,0));
  select * into r from private.workshop_warranty_receipts where operation_id=p_operation_id;
  if found then
    if r.request_fingerprint is distinct from v_request then raise exception 'Esta operacion ya se uso con otros datos.' using errcode='23514'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into w from public.repair_warranty_returns where id=p_return_id for update;
  if not found then raise exception 'No se encontro el reingreso.' using errcode='P0002'; end if;
  if w.version is distinct from p_expected_version then raise exception 'El reingreso cambio en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
  if w.closed_at is not null then raise exception 'Este reingreso ya fue retirado. Para otra visita registra un nuevo reingreso en la misma orden.' using errcode='23514'; end if;
  if p_status='retirado' and (w.status not in ('listo_para_retirar','no_presenta_fallas','sin_solucion') or length(trim(coalesce(p_recipient,'')))<2) then
    raise exception 'Guarda primero el resultado de la revision y luego indica quien retira.' using errcode='23514';
  end if;
  v_resolution:=case when p_status='no_presenta_fallas' and trim(coalesce(p_resolution,''))='' then 'No presenta fallas'
    when p_status='retirado' and trim(coalesce(p_resolution,''))='' then w.resolution else coalesce(p_resolution,'') end;
  update public.repair_warranty_returns set status=p_status,
    progress=case when p_status='retirado' and trim(coalesce(p_progress,''))='' then w.progress else coalesce(p_progress,'') end,
    resolution=v_resolution,recipient=case when p_status='retirado' then trim(p_recipient) else null end,
    closed_at=case when p_status='retirado' then now() else null end,version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=p_return_id returning version into v_version;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(w.order_id,'warranty',
    'Garantia: '||replace(p_status,'_',' ')||case when p_status='retirado' then '' else ' - '||left(coalesce(nullif(p_progress,''),v_resolution),500) end,auth.uid());
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
    values('repair_warranty_returns',w.id::text,'update',jsonb_build_object('before',to_jsonb(w),'request',v_request,'version',v_version),auth.uid());
  v_result:=jsonb_build_object('id',w.id,'version',v_version,'status',p_status,'replayed',false);
  insert into private.workshop_warranty_receipts(operation_id,request_fingerprint,result) values(p_operation_id,v_request,v_result);
  return v_result;
end $$;

create function private.workshop_warranty_read(p_order_ids uuid[] default null,p_closed boolean default false,p_search text default '',p_page integer default 1,p_page_size integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_total bigint; v_active bigint; v_page integer:=greatest(1,least(coalesce(p_page,1),100000));
  v_size integer:=greatest(1,least(coalesce(p_page_size,30),50)); v_admin boolean:=(select private.is_admin());
begin
  if (select private.can_access_operations()) is not true then raise exception 'Sin permiso para consultar garantias.' using errcode='42501'; end if;
  if coalesce(cardinality(p_order_ids),0)>100 then raise exception 'Consulta hasta 100 ordenes por pagina.' using errcode='23514'; end if;
  select count(*) into v_active from public.repair_warranty_returns where closed_at is null;
  with matching as (
    select w.*,o.repair_number,c.full_name,concat_ws(' - ',d.device_type,nullif(d.brand,''),nullif(d.model,'')) device_label,
      row_number() over(partition by w.order_id order by (w.closed_at is null) desc,w.created_at desc,w.id desc) rn
    from public.repair_warranty_returns w join public.repair_access_orders o on o.id=w.order_id
    join public.repair_access_customers c on c.id=o.customer_id join public.repair_access_devices d on d.id=o.device_id
    where (p_order_ids is not null and w.order_id=any(p_order_ids)) or
      (p_order_ids is null and (w.closed_at is not null)=coalesce(p_closed,false)
        and (coalesce(trim(p_search),'')='' or position(private.workshop_search_text(left(p_search,200)) in
          private.workshop_search_text(concat_ws(' ',o.repair_number,c.full_name,d.device_type,d.brand,d.model,w.issue_reported)))>0))
  ), selected as (
    select * from matching where p_order_ids is null or rn<=20
    order by (closed_at is null) desc,received_on desc,created_at desc,id desc
    limit case when p_order_ids is not null then 2000 else v_size end offset case when p_order_ids is not null then 0 else (v_page-1)*v_size end
  ) select (select count(*) from matching),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'orderId',order_id,'repairNumber',repair_number,'customerName',full_name,'deviceLabel',device_label,
    'receivedOn',received_on,'issueReported',issue_reported,'accessories',accessories,'conditionNotes',condition_notes,
    'status',status,'progress',progress,'resolution',resolution,'closedAt',closed_at,'recipient',case when v_admin then recipient else null end,
    'version',version,'createdAt',created_at) order by (closed_at is null) desc,received_on desc,created_at desc,id desc),'[]'::jsonb)
    into v_total,v_items from selected;
  return jsonb_build_object('items',v_items,'total',v_total,'activeCount',v_active,'page',v_page,'pageSize',v_size);
end $$;

create function public.workshop_warranty_start(p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_received_on date,p_issue text,p_accessories text,p_condition_notes text,p_acknowledge_coverage boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.workshop_warranty_start(p_order_id,p_expected_version,p_operation_id,p_received_on,p_issue,p_accessories,p_condition_notes,p_acknowledge_coverage)$$;
create function public.workshop_warranty_save(p_return_id uuid,p_expected_version integer,p_operation_id uuid,p_status text,p_progress text,p_resolution text,p_recipient text)
returns jsonb language sql security invoker set search_path='' as $$select private.workshop_warranty_save(p_return_id,p_expected_version,p_operation_id,p_status,p_progress,p_resolution,p_recipient)$$;
create function public.workshop_warranty_read(p_order_ids uuid[] default null,p_closed boolean default false,p_search text default '',p_page integer default 1,p_page_size integer default 30)
returns jsonb language sql stable security invoker set search_path='' as $$select private.workshop_warranty_read(p_order_ids,p_closed,p_search,p_page,p_page_size)$$;

revoke all on function public.workshop_warranty_start(uuid,integer,uuid,date,text,text,text,boolean),private.workshop_warranty_start(uuid,integer,uuid,date,text,text,text,boolean),
  public.workshop_warranty_save(uuid,integer,uuid,text,text,text,text),private.workshop_warranty_save(uuid,integer,uuid,text,text,text,text),
  public.workshop_warranty_read(uuid[],boolean,text,integer,integer),private.workshop_warranty_read(uuid[],boolean,text,integer,integer) from public,anon,authenticated;
grant execute on function public.workshop_warranty_start(uuid,integer,uuid,date,text,text,text,boolean),private.workshop_warranty_start(uuid,integer,uuid,date,text,text,text,boolean),
  public.workshop_warranty_save(uuid,integer,uuid,text,text,text,text),private.workshop_warranty_save(uuid,integer,uuid,text,text,text,text),
  public.workshop_warranty_read(uuid[],boolean,text,integer,integer),private.workshop_warranty_read(uuid[],boolean,text,integer,integer) to authenticated;

create or replace function private.workshop_deliver(p_order_id uuid,p_expected_version integer,p_recipient text,p_notes text,p_allow_balance boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_delivered timestamptz; v_version integer;
begin
  if (select private.is_admin()) is not true then raise exception 'Solo mostrador puede registrar la entrega.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.delivered_at is not null then return jsonb_build_object('id',p_order_id,'replayed',true); end if;
  if v_order.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio. Revisa el estado antes de entregarla.' using errcode='40001'; end if;
  if v_order.status not in ('listo_para_retirar','presupuestado_rechazado','sin_solucion','no_presenta_fallas') then raise exception 'La orden todavia no esta lista para entregar.' using errcode='23514'; end if;
  if length(trim(coalesce(p_recipient,'')))<2 then raise exception 'Indica quien retira el equipo.' using errcode='23514'; end if;
  if not v_order.is_paid and p_allow_balance is not true and (v_order.status='listo_para_retirar'
    or (v_order.status='no_presenta_fallas' and coalesce(nullif(v_order.final_amount,0),v_order.budget_amount,0)>0)) then
    raise exception 'Hay un cobro pendiente. Cobra o autoriza expresamente la entrega con saldo; No presenta fallas no elimina importes anteriores.' using errcode='23514';
  end if;
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

-- Old and current save entry points must preserve finances, not just the UI.
do $patch$
declare signature text; definition text; prefix text;
begin
  foreach signature in array array['private.workshop_save(uuid,integer,jsonb)',
    'private.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text)'] loop
    definition:=pg_get_functiondef(to_regprocedure(signature));
    if strpos(definition,'warranty-no-fault-preserve-v2')>0 then continue; end if;
    if length(definition)-length(replace(definition,E'\nbegin\n',''))<>length(E'\nbegin\n') then
      raise exception 'Unexpected workshop save definition. Review before applying.';
    end if;
    prefix:=E'\nbegin\n  -- warranty-no-fault-preserve-v2\n  if p_payload->>''status''=''no_presenta_fallas'' then\n    p_payload:=p_payload-''budget_amount''-''budget_detail''-''final_amount''-''quality_checked'';\n';
    if signature like '%save_quick%' then prefix:=prefix||E'    v_confirm:=false; p_channel:=''''; p_decision_notes:='''';\n'; end if;
    prefix:=prefix||E'  end if;\n';
    definition:=replace(definition,E'\nbegin\n',prefix);
    -- A delivered order is reviewed via its warranty visit, never by reopening its original status.
    if signature='private.workshop_save(uuid,integer,jsonb)' then
      prefix:=E'  if coalesce(nullif(p_payload->>''status'',''''),v_order.status)=''no_presenta_fallas'' then\n    p_payload:=p_payload-''budget_amount''-''budget_detail''-''final_amount''-''quality_checked'';\n    if v_order.delivered_at is not null or v_order.status=''retirado'' then\n      raise exception ''La orden ya fue retirada. Registra un reingreso por garantia.'' using errcode=''23514'';\n    end if;\n  end if;\n  v_status:=';
      if strpos(definition,'  v_status:=')=0 then raise exception 'Unexpected workshop status anchor.'; end if;
      definition:=replace(definition,'  v_status:=',prefix);
    end if;
    execute definition;
  end loop;

  foreach signature in array array['public.update_technician_repair_status(uuid,text)',
    'public.update_technician_repair_workshop(uuid,text,numeric,text,text)'] loop
    definition:=pg_get_functiondef(to_regprocedure(signature));
    if strpos(definition,'warranty-no-fault-legacy')>0 then continue; end if;
    if strpos(definition,'  if p_status not in (')=0 then raise exception 'Unexpected legacy workshop status anchor.'; end if;
    prefix:=E'  -- warranty-no-fault-legacy\n  if p_status=''no_presenta_fallas'' then\n    select * into strict v_order from public.repair_access_orders where id=p_order_id for update;\n    return private.workshop_save(p_order_id,v_order.workflow_version,jsonb_build_object(''status'',p_status';
    if signature like '%_workshop(%' then
      prefix:=prefix||E',''repair_progress'',coalesce(p_repair_progress,''''))';
    else prefix:=prefix||')'; end if;
    prefix:=prefix||E');\n  end if;\n  if p_status not in (';
    execute replace(definition,'  if p_status not in (',prefix);
  end loop;
  definition:=pg_get_functiondef('private.workshop_save(uuid,integer,jsonb)'::regprocedure);
  prefix:='budget_amount=case when v_status=''no_presenta_fallas'' or is_paid then budget_amount';
  if strpos(definition,prefix)=0 then
    if strpos(definition,'budget_amount=case when is_paid then budget_amount')=0 then raise exception 'Unexpected workshop quote preservation anchor.'; end if;
    execute replace(definition,'budget_amount=case when is_paid then budget_amount',prefix);
  end if;
end;
$patch$;

-- Preserve the current search/privacy contracts while adding the new return outcome.
do $$ declare signature text; definition text; updated text;
begin
  foreach signature in array array['private.workshop_read_page(text,text,text,text,timestamp with time zone,uuid,integer)',
    'private.get_workshop_inbox()','public.get_workshop_business_report(date,date)'] loop
    if to_regprocedure(signature) is not null then
      definition:=pg_get_functiondef(to_regprocedure(signature));
      updated:=replace(replace(definition,'''sin_solucion'',''presupuestado_rechazado''','''sin_solucion'',''presupuestado_rechazado'',''no_presenta_fallas'''),
        '''sin_solucion'', ''presupuestado_rechazado''','''sin_solucion'', ''presupuestado_rechazado'', ''no_presenta_fallas''');
      if updated is distinct from definition then execute updated; end if;
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
