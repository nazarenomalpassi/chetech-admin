begin;
set local lock_timeout='5s';

create or replace function private.guard_workshop_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_tech boolean:=(select private.is_technician()); v_profile public.profiles%rowtype;
begin
  if new.technician_id is distinct from old.technician_id then
    if v_tech and not (old.technician_id is null and new.technician_id=v_actor) then
      raise exception 'Solo podes tomar una orden sin responsable para vos mismo.' using errcode='42501';
    end if;
    if v_tech and (to_jsonb(new)-array['technician_id','technician_name','updated_by','updated_at','workflow_version'])
      is distinct from (to_jsonb(old)-array['technician_id','technician_name','updated_by','updated_at','workflow_version']) then
      raise exception 'La toma de orden solo puede modificar la asignacion.' using errcode='42501';
    end if;
    if new.technician_id is null then
      new.technician_name:=old.technician_name;
    else
      select * into v_profile from public.profiles where id=new.technician_id and account_status='active'
        and (role='tecnico' or (role='admin' and id=v_actor and old.technician_id is null and (select private.is_admin())));
      if not found then raise exception 'Selecciona una cuenta de tecnico activa.' using errcode='23514'; end if;
      new.technician_name:=v_profile.full_name;
    end if;
  elsif v_tech and old.technician_id is not null and new.technician_name is distinct from old.technician_name then
    raise exception 'El nombre de la cuenta asignada no se modifica desde la ficha.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists x_workshop_assignment_guard on public.repair_access_orders;
create trigger x_workshop_assignment_guard before update of technician_id,technician_name on public.repair_access_orders
  for each row execute function private.guard_workshop_assignment();

create or replace function private.workshop_claim_order(p_order_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_order public.repair_access_orders%rowtype; v_version integer; v_name text;
begin
  if (select private.can_access_operations()) is not true then raise exception 'Solo tecnico o administrador puede tomar una orden.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.workflow_version is distinct from p_expected_version then raise exception 'La orden cambio. Actualiza antes de tomarla.' using errcode='40001'; end if;
  if v_order.delivered_at is not null or v_order.status='retirado' then raise exception 'La orden ya fue entregada.' using errcode='23514'; end if;
  if v_order.technician_id is not null then
    if v_order.technician_id<>v_actor then raise exception 'La orden ya tiene responsable. Mostrador debe reasignarla.' using errcode='42501'; end if;
    return jsonb_build_object('id',p_order_id,'version',v_order.workflow_version,'assignedTechnicianId',v_actor,'assignedTechnicianName',v_order.technician_name,'replayed',true);
  end if;
  update public.repair_access_orders set technician_id=v_actor,updated_by=v_actor,updated_at=now() where id=p_order_id
    returning workflow_version,technician_name into v_version,v_name;
  update public.workshop_tasks set assigned_to=v_actor where order_id=p_order_id and kind='work' and resolved_at is null;
  insert into public.workshop_tasks(order_id,kind,title,assigned_to) values(p_order_id,'work','Revisar orden asignada',v_actor) on conflict do nothing;
  insert into public.workshop_events(order_id,kind,message,actor_id,order_version)
    values(p_order_id,'assignment','Orden tomada por su responsable',v_actor,v_version);
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id) values('repair_access_orders',p_order_id::text,'update',
    jsonb_build_object('operation','workshop_claim_order','technician_id',v_actor,'technician_name',v_name,'previous_technician_name',v_order.technician_name),v_actor);
  return jsonb_build_object('id',p_order_id,'version',v_version,'assignedTechnicianId',v_actor,'assignedTechnicianName',v_name,'claimed',true);
end $$;
create or replace function public.workshop_claim_order(p_order_id uuid,p_expected_version integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.workshop_claim_order(p_order_id,p_expected_version) $$;

revoke all on function private.guard_workshop_assignment() from public,anon,authenticated;
revoke all on function private.workshop_claim_order(uuid,integer),public.workshop_claim_order(uuid,integer) from public,anon;
grant execute on function private.workshop_claim_order(uuid,integer),public.workshop_claim_order(uuid,integer) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
