begin;
set local lock_timeout='5s';

-- A new scope supersedes legacy accepted/work states, without inventing consent.
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
    if old.approval_status='accepted'
      or (old.approval_status='legacy' and old.status in ('presupuestado_aceptado','en_reparacion','en_pruebas')) then
      new.status:='presupuestado';
      -- RPC dates came from the requested phase; only the final phase may start work.
      new.reviewed_at:=old.reviewed_at;
      new.repair_started_at:=old.repair_started_at;
      new.finished_at:=old.finished_at;
    end if;
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

revoke all on function private.guard_workshop_order() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
