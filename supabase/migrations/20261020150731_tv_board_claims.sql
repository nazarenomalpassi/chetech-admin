begin;
set local lock_timeout='5s';

-- Existing sale amounts, releases, stock and cash are deliberately not rewritten.
alter table public.tv_boards
  add column claim_status text not null default 'none' check(claim_status in ('none','open','cancelled')),
  add column claim_opened_at timestamptz,
  add column claim_notes text check(length(claim_notes)<=1000),
  add column claim_resolved_at timestamptz,
  add column claim_resolution_notes text check(length(claim_resolution_notes)<=1000),
  add column financial_version integer not null default 1 check(financial_version>0),
  add constraint tv_board_claim_financial_state check(
    claim_status='none' or (sold_at is not null and mercado_libre_net_amount is not null
      and mercado_libre_net_amount>=0 and released_at is null and not is_active and claim_opened_at is not null
      and ((claim_status='open' and claim_resolved_at is null) or (claim_status='cancelled' and claim_resolved_at is not null)))
  );
create index tv_boards_open_claims_idx on public.tv_boards(claim_opened_at desc,id) where claim_status='open';

create table public.tv_board_sale_events (
  id uuid primary key,
  board_id uuid not null references public.tv_boards(id) on delete restrict,
  kind text not null check(kind in ('start_claim','resume_sale','cancel_sale','confirm_release')),
  notes text not null default '' check(length(notes)<=1000),
  net_amount numeric(12,2) not null check(net_amount>=0),
  from_state text not null,
  to_state text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index tv_board_sale_events_board_idx on public.tv_board_sale_events(board_id,created_at desc,id);
create index tv_board_sale_events_actor_idx on public.tv_board_sale_events(actor_id);
alter table public.tv_board_sale_events enable row level security;
revoke all on public.tv_board_sale_events from public,anon,authenticated;
grant select on public.tv_board_sale_events to authenticated;
revoke all on public.tv_board_sale_events from service_role;
grant select on public.tv_board_sale_events to service_role;
create policy tv_board_sale_events_admin_read on public.tv_board_sale_events for select to authenticated
  using((select private.is_admin()));

create table private.tv_board_sale_receipts (
  operation_id uuid primary key,
  request_fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.tv_board_sale_receipts from public,anon,authenticated;

create function private.guard_tv_board_sale()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.sold_at is not null then
      raise exception 'Una placa vendida conserva su historial. Resuelve o anula su venta desde Reclamos.' using errcode='23514';
    end if;
    return old;
  end if;
  if current_user not in ('postgres','service_role') then
    if tg_op='INSERT' then
      if new.claim_status<>'none' or new.claim_opened_at is not null or new.claim_notes is not null
        or new.claim_resolved_at is not null or new.claim_resolution_notes is not null or new.financial_version<>1 or new.released_at is not null then
        raise exception 'Los reclamos se registran desde la accion de seguimiento.' using errcode='42501';
      end if;
    elsif row(new.claim_status,new.claim_opened_at,new.claim_notes,new.claim_resolved_at,new.claim_resolution_notes,new.financial_version,new.released_at)
      is distinct from row(old.claim_status,old.claim_opened_at,old.claim_notes,old.claim_resolved_at,old.claim_resolution_notes,old.financial_version,old.released_at) then
      raise exception 'Los reclamos se registran desde la accion de seguimiento.' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' then
    if old.sold_at is not null and (new.sold_at is distinct from old.sold_at
      or new.mercado_libre_net_amount is distinct from old.mercado_libre_net_amount or new.is_active) then
      raise exception 'La venta original no se sobrescribe ni vuelve al stock automaticamente.' using errcode='23514';
    end if;
    if old.released_at is not null and new.released_at is distinct from old.released_at then
      raise exception 'La liberacion confirmada conserva su historial.' using errcode='23514';
    end if;
    new.financial_version:=old.financial_version+1;
  end if;
  return new;
end $$;
revoke all on function private.guard_tv_board_sale() from public,anon,authenticated;
create trigger tv_board_sale_guard before insert or update or delete on public.tv_boards
  for each row execute function private.guard_tv_board_sale();

create function private.tv_board_sale_transition(p_board_id uuid,p_expected_version integer,p_operation_id uuid,p_kind text,p_notes text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.tv_boards%rowtype; r private.tv_board_sale_receipts%rowtype;
  v_request jsonb; v_result jsonb; v_version integer; v_before text; v_after text;
  v_notes text:=trim(coalesce(p_notes,''));
begin
  if (select private.is_admin()) is not true then raise exception 'Solo administracion puede gestionar ventas y reclamos de placas.' using errcode='42501'; end if;
  if p_board_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<1
    or p_kind is null or p_kind not in ('start_claim','resume_sale','cancel_sale','confirm_release') or length(v_notes)>1000 then
    raise exception 'Revisa la placa y los datos del seguimiento.' using errcode='23514';
  end if;
  v_request:=jsonb_build_object('actor',auth.uid(),'board',p_board_id,'version',p_expected_version,'kind',p_kind,'notes',v_notes);
  perform pg_advisory_xact_lock(hashtextextended('tv-board.sale:'||p_operation_id::text,0));
  select * into r from private.tv_board_sale_receipts where operation_id=p_operation_id;
  if found then
    if r.request_fingerprint is distinct from v_request then raise exception 'Esta operacion ya se uso con otros datos. Reabre el seguimiento.' using errcode='23514'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into b from public.tv_boards where id=p_board_id for update;
  if not found then raise exception 'No encontramos la placa.' using errcode='P0002'; end if;
  if b.financial_version is distinct from p_expected_version then raise exception 'La placa cambio en otro dispositivo. Actualiza antes de continuar.' using errcode='40001'; end if;
  if b.sold_at is null or b.mercado_libre_net_amount is null or b.mercado_libre_net_amount<0 then
    raise exception 'Primero registra la venta y su importe neto.' using errcode='23514';
  end if;
  if b.released_at is not null then raise exception 'Esta venta ya tiene la liberacion confirmada.' using errcode='23514'; end if;
  if p_kind in ('start_claim','confirm_release') and b.claim_status<>'none' then
    raise exception 'Resuelve el reclamo antes de confirmar la liberacion. Una venta anulada no tiene dinero pendiente.' using errcode='23514';
  end if;
  if p_kind in ('resume_sale','cancel_sale') and b.claim_status<>'open' then
    raise exception 'Esta placa no tiene un reclamo abierto. Actualiza el listado.' using errcode='23514';
  end if;
  v_before:=case when b.claim_status='open' then 'claim_open' when b.claim_status='cancelled' then 'cancelled' else 'pending_release' end;
  v_after:=case p_kind when 'start_claim' then 'claim_open' when 'cancel_sale' then 'cancelled' when 'confirm_release' then 'released' else 'pending_release' end;
  update public.tv_boards set
    claim_status=case p_kind when 'start_claim' then 'open' when 'cancel_sale' then 'cancelled' else 'none' end,
    claim_opened_at=case when p_kind='start_claim' then now() else claim_opened_at end,
    claim_notes=case when p_kind='start_claim' then v_notes else claim_notes end,
    claim_resolved_at=case when p_kind='start_claim' then null when p_kind in ('resume_sale','cancel_sale') then now() else claim_resolved_at end,
    claim_resolution_notes=case when p_kind='start_claim' then null when p_kind in ('resume_sale','cancel_sale') then v_notes else claim_resolution_notes end,
    released_at=case when p_kind='confirm_release' then now() else released_at end
    where id=b.id returning financial_version into v_version;
  insert into public.tv_board_sale_events(id,board_id,kind,notes,net_amount,from_state,to_state,actor_id)
    values(p_operation_id,b.id,p_kind,v_notes,b.mercado_libre_net_amount,v_before,v_after,auth.uid());
  insert into public.audit_logs(entity_type,entity_id,action,changes,user_id)
    values('tv_boards',b.id::text,'update',jsonb_build_object('operationId',p_operation_id,'kind',p_kind,'from',v_before,'to',v_after,
      'netAmount',b.mercado_libre_net_amount,'notes',v_notes,'version',v_version),auth.uid());
  v_result:=jsonb_build_object('id',b.id,'version',v_version,'status',v_after,'kind',p_kind,'replayed',false);
  insert into private.tv_board_sale_receipts(operation_id,request_fingerprint,result) values(p_operation_id,v_request,v_result);
  return v_result;
end $$;
revoke all on function private.tv_board_sale_transition(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function private.tv_board_sale_transition(uuid,integer,uuid,text,text) to authenticated;

create function public.tv_board_sale_transition(p_board_id uuid,p_expected_version integer,p_operation_id uuid,p_kind text,p_notes text default '')
returns jsonb language sql security invoker set search_path='' as $$
  select private.tv_board_sale_transition(p_board_id,p_expected_version,p_operation_id,p_kind,p_notes);
$$;
revoke all on function public.tv_board_sale_transition(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tv_board_sale_transition(uuid,integer,uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
