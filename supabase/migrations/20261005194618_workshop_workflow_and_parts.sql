begin;

alter table public.repair_access_orders
  add column if not exists workflow_version integer not null default 1,
  add column if not exists budget_revision integer not null default 0,
  add column if not exists approval_status text not null default 'legacy' check (approval_status in ('legacy','pending','accepted','rejected','revoked')),
  add column if not exists physical_location text,
  add column if not exists next_action_date date,
  add column if not exists quality_checked_at timestamptz,
  add column if not exists quality_checked_by uuid references public.profiles(id),
  add column if not exists quality_notes text;

alter table public.repair_access_orders drop constraint if exists repair_access_orders_status_check;
alter table public.repair_access_orders add constraint repair_access_orders_status_check check
  (status in ('pendiente_revision','en_revision','presupuestado','presupuestado_aceptado','presupuestado_rechazado','en_reparacion','en_pruebas','listo_para_retirar','retirado','sin_solucion'));

create table public.repair_budget_versions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.repair_access_orders(id),
  revision integer not null check (revision > 0),
  amount numeric(12,2) not null check (amount >= 0),
  detail text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(order_id, revision)
);
create table public.repair_customer_decisions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  order_id uuid not null references public.repair_access_orders(id),
  budget_version_id uuid not null references public.repair_budget_versions(id),
  decision text not null check(decision in ('accepted','rejected','revoked')),
  channel text not null check(channel in ('presencial','telefono','whatsapp','portal')),
  notes text not null default '',
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.repair_part_requests (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  order_id uuid not null references public.repair_access_orders(id),
  description text not null check(length(trim(description)) between 3 and 500),
  product_id uuid references public.products(id),
  quantity integer not null check(quantity > 0 and quantity <= 10000),
  received_quantity integer not null default 0 check(received_quantity >= 0),
  installed_quantity integer not null default 0 check(installed_quantity >= 0),
  reserved_quantity integer not null default 0 check(reserved_quantity >= 0),
  status text not null default 'requested' check(status in ('requested','ordered','received','installed','cancelled')),
  priority text not null default 'normal' check(priority in ('normal','alta','urgente')),
  requested_by uuid not null references public.profiles(id),
  buyer_id uuid references public.profiles(id),
  supplier text,
  unit_cost numeric(12,2) check(unit_cost >= 0),
  expected_date date,
  notes text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(received_quantity <= quantity),
  check(installed_quantity <= received_quantity)
);
create index repair_parts_order_idx on public.repair_part_requests(order_id, created_at);
create index repair_parts_queue_idx on public.repair_part_requests(status, expected_date, created_at);
create index repair_parts_stock_idx on public.repair_part_requests(product_id) where reserved_quantity > 0;
create table public.workshop_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.repair_access_orders(id),
  kind text not null,
  message text not null,
  actor_id uuid references public.profiles(id),
  order_version integer,
  created_at timestamptz not null default now()
);
create index workshop_events_order_idx on public.workshop_events(order_id, created_at desc);
create index workshop_events_changes_idx on public.workshop_events(created_at desc, id);
create table public.workshop_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.repair_access_orders(id),
  kind text not null check(kind in ('approval','parts','work','delivery')),
  title text not null,
  assigned_to uuid references public.profiles(id),
  due_date date,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index workshop_one_open_task on public.workshop_tasks(order_id,kind) where resolved_at is null;
create index workshop_tasks_pending_idx on public.workshop_tasks(assigned_to,due_date) where resolved_at is null;

alter table public.repair_budget_versions enable row level security;
alter table public.repair_customer_decisions enable row level security;
alter table public.repair_part_requests enable row level security;
alter table public.workshop_events enable row level security;
alter table public.workshop_tasks enable row level security;
create policy budget_ops_read on public.repair_budget_versions for select to authenticated using((select private.can_access_operations()));
create policy decisions_ops_read on public.repair_customer_decisions for select to authenticated using((select private.can_access_operations()));
create policy parts_admin_read on public.repair_part_requests for select to authenticated using((select private.is_admin()));
create policy events_ops_read on public.workshop_events for select to authenticated using((select private.can_access_operations()));
create policy tasks_ops_read on public.workshop_tasks for select to authenticated using((select private.can_access_operations()));
grant select on public.repair_budget_versions, public.repair_customer_decisions, public.repair_part_requests, public.workshop_events, public.workshop_tasks to authenticated;
grant all on public.repair_budget_versions, public.repair_customer_decisions, public.repair_part_requests, public.workshop_events, public.workshop_tasks to service_role;

create or replace function private.guard_workshop_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and (select private.is_technician()) and new.status in ('presupuestado_aceptado','presupuestado_rechazado','retirado') then
    raise exception 'La aprobacion del cliente y la entrega se registran desde mostrador.' using errcode='42501';
  end if;
  if new.status in ('en_reparacion','en_pruebas') and new.status is distinct from old.status and new.approval_status <> 'accepted' and old.status not in ('presupuestado_aceptado','en_reparacion','en_pruebas') then
    raise exception 'Primero registra la autorizacion del cliente.' using errcode='23514';
  end if;
  if (new.budget_amount,new.budget_detail) is distinct from (old.budget_amount,old.budget_detail) then
    if old.is_paid and new.budget_amount is distinct from old.budget_amount then
      raise exception 'El importe cobrado esta protegido. Registra una correccion desde cobros.' using errcode='23514';
    end if;
    new.budget_revision := old.budget_revision + 1;
    new.approval_status := 'pending';
    new.approved_amount := null;
    new.approved_at := null;
    if old.approval_status='accepted' then new.status := 'presupuestado'; end if;
  elsif new.approval_status is not distinct from old.approval_status then
    new.budget_response_at := old.budget_response_at;
  end if;
  if new.status='listo_para_retirar' and new.status is distinct from old.status and new.quality_checked_at is null then
    raise exception 'Completa el control de calidad antes de marcar listo para retirar.' using errcode='23514';
  end if;
  new.workflow_version := old.workflow_version + 1;
  return new;
end $$;
create trigger z_workshop_order_guard before update on public.repair_access_orders for each row execute function private.guard_workshop_order();

create or replace function private.record_workshop_order_event() returns trigger language plpgsql security definer set search_path='' as $$
declare v_message text;
begin
  if new.budget_revision > old.budget_revision then
    insert into public.repair_budget_versions(order_id,revision,amount,detail,created_by)
    values(new.id,new.budget_revision,coalesce(new.budget_amount,0),coalesce(new.budget_detail,''),auth.uid()) on conflict do nothing;
  end if;
  v_message := case
    when new.repair_progress is distinct from old.repair_progress then coalesce(nullif(new.repair_progress,''),'Avance actualizado')
    when new.status is distinct from old.status then 'Estado: '||replace(new.status,'_',' ')
    when new.budget_revision > old.budget_revision then 'Nueva version de presupuesto: '||new.budget_revision
    when new.technician_id is distinct from old.technician_id then 'Responsable actualizado'
    else 'Ficha actualizada' end;
  insert into public.workshop_events(order_id,kind,message,actor_id,order_version) values(new.id,'update',v_message,auth.uid(),new.workflow_version);
  if new.status='presupuestado' then
    insert into public.workshop_tasks(order_id,kind,title) values(new.id,'approval','Consultar autorizacion del cliente') on conflict do nothing;
  end if;
  if new.status='listo_para_retirar' then
    insert into public.workshop_tasks(order_id,kind,title) values(new.id,'delivery','Avisar y coordinar retiro') on conflict do nothing;
  end if;
  if new.delivered_at is not null then
    update public.workshop_tasks set resolved_at=now(),resolved_by=auth.uid() where order_id=new.id and resolved_at is null;
    update public.repair_part_requests set reserved_quantity=0,version=version+1 where order_id=new.id and reserved_quantity>0;
  end if;
  return new;
end $$;
create trigger zz_workshop_order_event after update on public.repair_access_orders for each row execute function private.record_workshop_order_event();

create or replace function private.workshop_decide(p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_decision text,p_channel text,p_notes text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_quote uuid;
begin
  if not (select private.is_admin()) then raise exception 'Solo mostrador puede registrar la decision del cliente.' using errcode='42501'; end if;
  if exists(select 1 from public.repair_customer_decisions where operation_id=p_operation_id and order_id=p_order_id) then return jsonb_build_object('id',p_order_id,'replayed',true); end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.workflow_version<>p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza y revisa el presupuesto.' using errcode='40001'; end if;
  if p_decision not in ('accepted','rejected','revoked') or p_channel not in ('presencial','telefono','whatsapp','portal') then raise exception 'La decision o el canal no son validos.' using errcode='23514'; end if;
  if v_order.delivered_at is not null then raise exception 'La orden ya fue entregada.' using errcode='23514'; end if;
  if p_decision='revoked' and (v_order.approval_status<>'accepted' or length(trim(coalesce(p_notes,'')))<3) then raise exception 'Indica el motivo para revocar una aceptacion vigente.' using errcode='23514'; end if;
  if p_decision<>'revoked' and v_order.approval_status='accepted' then raise exception 'Este presupuesto ya tiene una aceptacion vigente.' using errcode='23514'; end if;
  if p_decision='accepted' and coalesce(v_order.budget_amount,0)<=0 then raise exception 'Carga el importe y alcance del presupuesto antes de confirmarlo.' using errcode='23514'; end if;
  if v_order.budget_revision=0 then
    update public.repair_access_orders set budget_revision=1 where id=p_order_id;
    v_order.budget_revision:=1;
  end if;
  insert into public.repair_budget_versions(order_id,revision,amount,detail,created_by) values(p_order_id,v_order.budget_revision,coalesce(v_order.budget_amount,0),coalesce(v_order.budget_detail,''),auth.uid()) on conflict do nothing;
  select id into strict v_quote from public.repair_budget_versions where order_id=p_order_id and revision=v_order.budget_revision;
  insert into public.repair_customer_decisions(operation_id,order_id,budget_version_id,decision,channel,notes,recorded_by) values(p_operation_id,p_order_id,v_quote,p_decision,p_channel,coalesce(p_notes,''),auth.uid());
  update public.repair_access_orders set approval_status=p_decision,
    approved_amount=case when p_decision='accepted' then budget_amount else null end,
    approved_at=case when p_decision='accepted' then now() else null end,
    budget_response_at=now(),budget_response_notes=nullif(p_notes,''),
    status=case p_decision when 'accepted' then 'presupuestado_aceptado' when 'rejected' then 'presupuestado_rechazado' else 'presupuestado' end,updated_by=auth.uid(),updated_at=now() where id=p_order_id;
  update public.workshop_tasks set resolved_at=now(),resolved_by=auth.uid() where order_id=p_order_id and kind='approval' and resolved_at is null;
  insert into public.workshop_tasks(order_id,kind,title,assigned_to) values(p_order_id,case when p_decision='accepted' then 'work' else 'delivery' end,case when p_decision='accepted' then 'Continuar trabajo autorizado' else 'Coordinar devolucion del equipo' end,v_order.technician_id) on conflict do nothing;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(p_order_id,'decision',case p_decision when 'accepted' then 'Cliente confirmo presupuesto version ' when 'rejected' then 'Cliente rechazo presupuesto version ' else 'Aceptacion revocada, presupuesto version ' end||v_order.budget_revision||' por '||p_channel,auth.uid());
  return jsonb_build_object('id',p_order_id);
end $$;

create or replace function public.workshop_decide(p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_decision text,p_channel text,p_notes text) returns jsonb language sql set search_path='' as $$ select private.workshop_decide(p_order_id,p_expected_version,p_operation_id,p_decision,p_channel,p_notes) $$;

create or replace function private.workshop_save(p_order_id uuid,p_expected_version integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype; v_status text; v_tech public.profiles%rowtype;
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para actualizar la orden.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.workflow_version<>p_expected_version then raise exception 'La orden cambio en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
  v_status:=coalesce(nullif(p_payload->>'status',''),v_order.status);
  if v_status in ('presupuestado_aceptado','presupuestado_rechazado','retirado') and v_status<>v_order.status then raise exception 'Usa la accion de confirmacion del cliente o de entrega.' using errcode='23514'; end if;
  if p_payload ? 'technician_id' then
    if not (select private.is_admin()) then raise exception 'La asignacion se realiza desde mostrador.' using errcode='42501'; end if;
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
    quality_checked_at=case when coalesce((p_payload->>'quality_checked')::boolean,false) then now() else quality_checked_at end,
    quality_checked_by=case when coalesce((p_payload->>'quality_checked')::boolean,false) then auth.uid() else quality_checked_by end,
    quality_notes=case when p_payload ? 'quality_notes' then nullif(p_payload->>'quality_notes','') else quality_notes end,
    reviewed_at=case when v_status='en_revision' then coalesce(reviewed_at,now()) else reviewed_at end,
    budgeted_at=case when coalesce((p_payload->>'budget_amount')::numeric,0)>0 then coalesce(budgeted_at,now()) else budgeted_at end,
    repair_started_at=case when v_status='en_reparacion' then coalesce(repair_started_at,now()) else repair_started_at end,
    finished_at=case when v_status='listo_para_retirar' then coalesce(finished_at,now()) else finished_at end,
    updated_by=auth.uid(),updated_at=now() where id=p_order_id;
  if v_status is distinct from v_order.status then insert into public.repair_access_status_history(repair_order_id,previous_status,next_status,changed_by,notes) values(p_order_id,v_order.status,v_status,auth.uid(),p_payload->>'repair_progress'); end if;
  return jsonb_build_object('id',p_order_id);
end $$;
create or replace function public.workshop_save(p_order_id uuid,p_expected_version integer,p_payload jsonb) returns jsonb language sql set search_path='' as $$ select private.workshop_save(p_order_id,p_expected_version,p_payload) $$;

create or replace function private.workshop_deliver(p_order_id uuid,p_expected_version integer,p_recipient text,p_notes text,p_allow_balance boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.repair_access_orders%rowtype;
begin
  if not (select private.is_admin()) then raise exception 'Solo mostrador puede registrar la entrega.' using errcode='42501'; end if;
  select * into strict v_order from public.repair_access_orders where id=p_order_id for update;
  if v_order.delivered_at is not null then return jsonb_build_object('id',p_order_id,'replayed',true); end if;
  if v_order.workflow_version<>p_expected_version then raise exception 'La orden cambio. Revisa el estado antes de entregarla.' using errcode='40001'; end if;
  if v_order.status not in ('listo_para_retirar','presupuestado_rechazado','sin_solucion') then raise exception 'La orden todavia no esta lista para entregar.' using errcode='23514'; end if;
  if length(trim(coalesce(p_recipient,'')))<2 then raise exception 'Indica quien retira el equipo.' using errcode='23514'; end if;
  if v_order.status='listo_para_retirar' and not v_order.is_paid and not p_allow_balance then raise exception 'Hay un cobro pendiente. Cobra o autoriza la entrega con saldo.' using errcode='23514'; end if;
  if p_allow_balance and length(trim(coalesce(p_notes,'')))<3 then raise exception 'Indica el motivo de entregar con saldo pendiente.' using errcode='23514'; end if;
  update public.repair_access_orders set status='retirado',picked_up_at=now(),delivered_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_order_id;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(p_order_id,'delivery','Retiro registrado: '||trim(p_recipient)||case when coalesce(p_notes,'')='' then '' else '. '||p_notes end,auth.uid());
  return jsonb_build_object('id',p_order_id);
end $$;
create or replace function public.workshop_deliver(p_order_id uuid,p_expected_version integer,p_recipient text,p_notes text,p_allow_balance boolean) returns jsonb language sql set search_path='' as $$ select private.workshop_deliver(p_order_id,p_expected_version,p_recipient,p_notes,p_allow_balance) $$;

create or replace function private.workshop_request_part(p_order_id uuid,p_operation_id uuid,p_description text,p_quantity integer,p_priority text,p_notes text,p_product_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_delivered timestamptz;
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para solicitar repuestos.' using errcode='42501'; end if;
  select id into v_id from public.repair_part_requests where operation_id=p_operation_id and order_id=p_order_id;
  if found then return jsonb_build_object('id',v_id,'replayed',true); end if;
  select delivered_at into strict v_delivered from public.repair_access_orders where id=p_order_id for update;
  if v_delivered is not null then raise exception 'La orden ya fue entregada.' using errcode='23514'; end if;
  insert into public.repair_part_requests(operation_id,order_id,description,quantity,priority,requested_by,notes,product_id)
    values(p_operation_id,p_order_id,trim(p_description),p_quantity,p_priority,auth.uid(),nullif(p_notes,''),p_product_id) returning id into v_id;
  insert into public.workshop_tasks(order_id,kind,title) values(p_order_id,'parts','Gestionar repuestos solicitados') on conflict do nothing;
  insert into public.workshop_events(order_id,kind,message,actor_id) values(p_order_id,'part_request','Repuesto solicitado: '||trim(p_description)||' ('||p_quantity||')',auth.uid());
  update public.repair_access_orders set updated_by=auth.uid(),updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',v_id);
end $$;
create or replace function public.workshop_request_part(p_order_id uuid,p_operation_id uuid,p_description text,p_quantity integer,p_priority text,p_notes text,p_product_id uuid default null) returns jsonb language sql set search_path='' as $$ select private.workshop_request_part(p_order_id,p_operation_id,p_description,p_quantity,p_priority,p_notes,p_product_id) $$;

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
create or replace function public.workshop_manage_part(p_id uuid,p_expected_version integer,p_action text,p_quantity integer,p_supplier text,p_unit_cost numeric,p_expected_date date,p_notes text) returns jsonb language sql set search_path='' as $$ select private.workshop_manage_part(p_id,p_expected_version,p_action,p_quantity,p_supplier,p_unit_cost,p_expected_date,p_notes) $$;

create or replace function private.get_workshop_context(p_order_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean := (select private.is_admin()); v_result jsonb;
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para consultar el taller.' using errcode='42501'; end if;
  if coalesce(cardinality(p_order_ids),0)>100 then raise exception 'Consulta hasta 100 ordenes por pagina.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'version',o.workflow_version,'budgetRevision',o.budget_revision,'approvalStatus',o.approval_status,'approvedAmount',o.approved_amount,
    'assignedTechnicianId',o.technician_id,'assignedTechnicianName',o.technician_name,'location',o.physical_location,'nextActionDate',o.next_action_date,
    'qualityCheckedAt',o.quality_checked_at,'qualityNotes',o.quality_notes,
    'parts',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'orderId',r.order_id,'description',r.description,'quantity',r.quantity,'receivedQuantity',r.received_quantity,'installedQuantity',r.installed_quantity,'status',r.status,'priority',r.priority,'supplier',case when v_admin then r.supplier else null end,'expectedDate',r.expected_date,'notes',case when v_admin then r.notes else null end,'unitCost',case when v_admin then r.unit_cost else null end,'productId',r.product_id,'version',r.version,'createdAt',r.created_at) order by r.created_at),'[]'::jsonb) from public.repair_part_requests r where r.order_id=o.id),
    'events',(select coalesce(jsonb_agg(e.payload order by e.created_at desc),'[]'::jsonb) from (select jsonb_build_object('id',we.id,'kind',we.kind,'message',we.message,'actorName',coalesce(p.full_name,'Sistema'),'createdAt',we.created_at) payload,we.created_at from public.workshop_events we left join public.profiles p on p.id=we.actor_id where we.order_id=o.id order by we.created_at desc limit 20) e)
  )),'[]'::jsonb) into v_result from public.repair_access_orders o where o.id=any(p_order_ids);
  return v_result;
end $$;
create or replace function public.get_workshop_context(p_order_ids uuid[]) returns jsonb language sql stable set search_path='' as $$ select private.get_workshop_context(p_order_ids) $$;

create or replace function private.get_workshop_inbox() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not (select private.can_access_operations()) then raise exception 'Sin permiso para consultar pendientes.' using errcode='42501'; end if;
  return jsonb_build_object(
    'tasks',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'orderId',t.order_id,'repairNumber',o.repair_number,'kind',t.kind,'title',t.title,'assignedTo',t.assigned_to,'dueDate',t.due_date,'createdAt',t.created_at) order by t.created_at),'[]'::jsonb) from public.workshop_tasks t join public.repair_access_orders o on o.id=t.order_id where t.resolved_at is null and ((select private.is_admin()) or t.assigned_to=auth.uid() or t.assigned_to is null)),
    'technicians',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(full_name,'Sin nombre')) order by full_name),'[]'::jsonb) from public.profiles where role in ('admin','tecnico','empleado')),
    'counts',(select jsonb_build_object('unassigned',count(*) filter(where technician_id is null and delivered_at is null and status<>'retirado'),'waitingCustomer',count(*) filter(where status='presupuestado' and delivered_at is null),'awaitingReturn',count(*) filter(where status in ('sin_solucion','presupuestado_rechazado') and delivered_at is null),'ready',count(*) filter(where status='listo_para_retirar' and delivered_at is null),'blockedParts',(select count(distinct order_id) from public.repair_part_requests where status not in ('cancelled','installed') and received_quantity<quantity)) from public.repair_access_orders)
  );
end $$;
create or replace function public.get_workshop_inbox() returns jsonb language sql stable set search_path='' as $$ select private.get_workshop_inbox() $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('workshop_decide','workshop_save','workshop_deliver','workshop_request_part','workshop_manage_part','get_workshop_context','get_workshop_inbox') loop
    execute 'REVOKE ALL ON FUNCTION '||r.signature||' FROM PUBLIC, anon';
    execute 'GRANT EXECUTE ON FUNCTION '||r.signature||' TO authenticated, service_role';
  end loop;
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.workshop_events;
  end if;
end $$;

commit;
