-- Incremental operations amendments. The original closing table remains immutable.
begin;

alter table public.visits add column client_operation_id uuid;
create unique index visits_client_operation_key on public.visits(client_operation_id) where client_operation_id is not null;

create table public.operations_cash_reconciliation_amendments (
  id uuid primary key,
  root_id uuid not null references public.operations_cash_reconciliations(id) on delete restrict,
  supersedes_id uuid,
  kind text not null check (kind in ('reopened', 'closed')),
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  accounts jsonb not null check (jsonb_typeof(accounts) = 'array' and jsonb_array_length(accounts) = 3),
  observations text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(root_id, id),
  foreign key(root_id, supersedes_id) references public.operations_cash_reconciliation_amendments(root_id, id) on delete restrict
);
create unique index operations_cash_amendments_first on public.operations_cash_reconciliation_amendments(root_id) where supersedes_id is null;
create unique index operations_cash_amendments_successor on public.operations_cash_reconciliation_amendments(supersedes_id) where supersedes_id is not null;

alter table public.operations_cash_reconciliation_amendments enable row level security;
revoke all on public.operations_cash_reconciliation_amendments from anon, authenticated;
grant select, insert on public.operations_cash_reconciliation_amendments to authenticated;
create policy operations_cash_amendments_admin_read on public.operations_cash_reconciliation_amendments
for select to authenticated using ((select role from public.profiles where id = (select auth.uid())) = 'admin');
create policy operations_cash_amendments_admin_insert on public.operations_cash_reconciliation_amendments
for insert to authenticated with check (created_by = (select auth.uid()) and (select role from public.profiles where id = (select auth.uid())) = 'admin');

create function public.validate_operations_cash_amendment_chain()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  previous_accounts jsonb;
  previous_kind text;
  account jsonb;
  expected_before numeric;
begin
  if tg_op <> 'INSERT' then raise exception 'Las correcciones son inmutables.' using errcode = '23514'; end if;
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Sin permiso para corregir arqueos.' using errcode = '42501';
  end if;
  if new.supersedes_id is null then
    select accounts, 'closed' into previous_accounts, previous_kind from public.operations_cash_reconciliations where id = new.root_id;
  else
    select accounts, kind into previous_accounts, previous_kind from public.operations_cash_reconciliation_amendments where id = new.supersedes_id and root_id = new.root_id;
  end if;
  if previous_accounts is null or new.kind = previous_kind then
    raise exception 'Reabrir un cierre antes de corregirlo; cerrar la reapertura antes de reabrir.' using errcode = '23514';
  end if;
  if new.kind = 'reopened' and new.accounts is distinct from previous_accounts then
    raise exception 'La reapertura conserva el conteo previo.' using errcode = '23514';
  end if;
  for account in select value from jsonb_array_elements(new.accounts) loop
    select (value->>'expected')::numeric into expected_before from jsonb_array_elements(previous_accounts)
      where value->>'method' = account->>'method';
    if expected_before is null or (account->>'expected')::numeric is distinct from expected_before then
      raise exception 'Una correccion no cambia el saldo esperado historico.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
create trigger operations_cash_amendments_1_chain before insert or update or delete on public.operations_cash_reconciliation_amendments
for each row execute function public.validate_operations_cash_amendment_chain();
create trigger operations_cash_amendments_2_counts before insert or update or delete on public.operations_cash_reconciliation_amendments
for each row execute function public.validate_operations_cash_reconciliation();
revoke all on function public.validate_operations_cash_amendment_chain() from public;

-- Read-only operations page. Linked REP data is read under the caller's RLS.
create function public.get_operations_outsourcings_page(
  p_search text default '', p_status text default 'en_taller', p_from date default null,
  p_to date default null, p_page integer default 1
)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare
  today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Sin permiso para consultar terciarizaciones.' using errcode = '42501';
  end if;
  return (
    with filtered as materialized (
      select r.* from public.repair_outsourcings r
      left join public.repair_access_orders o on o.id = r.repair_access_order_id
      left join public.repair_access_customers c on c.id = o.customer_id
      left join public.repair_access_devices d on d.id = o.device_id
      where (p_from is null or r.sent_at >= p_from) and (p_to is null or r.sent_at <= p_to)
        and (p_status = 'todos' or (p_status = 'vencidas' and r.status = 'en_taller' and r.promised_at < today) or r.status = p_status)
        and (coalesce(btrim(p_search), '') = '' or position(lower(btrim(p_search)) in lower(concat_ws(' ',
          r.workshop_name, r.responsible_name, r.notes, o.repair_number, o.issue_reported,
          c.full_name, c.phone, c.dni, d.device_type, d.brand, d.model, d.serial_number))) > 0)
    ), meta as (
      select count(*)::integer as total, greatest(1, least(greatest(1, coalesce(p_page, 1)), greatest(1, ceil(count(*) / 25.0)::integer))) as page from filtered
    ), page_rows as (
      select f.* from filtered f order by f.created_at desc, f.id desc
      limit 25 offset (select (page - 1) * 25 from meta)
    )
    select jsonb_build_object(
      'total', meta.total, 'page', meta.page,
      'records', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('repair_access_orders',
        jsonb_build_object('id', o.id, 'repair_number', o.repair_number, 'intake_date', o.intake_date,
          'issue_reported', o.issue_reported, 'status', o.status,
          'repair_access_customers', jsonb_build_object('full_name', c.full_name, 'phone', c.phone, 'dni', c.dni, 'address', c.address),
          'repair_access_devices', jsonb_build_object('device_type', d.device_type, 'brand', d.brand, 'model', d.model, 'serial_number', d.serial_number, 'accessory_details', d.accessory_details)))
        order by p.created_at desc, p.id desc)
        from page_rows p left join public.repair_access_orders o on o.id = p.repair_access_order_id
        left join public.repair_access_customers c on c.id = o.customer_id
        left join public.repair_access_devices d on d.id = o.device_id), '[]'::jsonb),
      'summary', (select jsonb_build_object('total', count(*), 'active', count(*) filter (where status = 'en_taller'),
        'retrieved', count(*) filter (where status = 'retirado'), 'sentToday', count(*) filter (where sent_at = today),
        'workshops', count(distinct lower(btrim(workshop_name))),
        'overdue', count(*) filter (where status = 'en_taller' and promised_at < today),
        'pendingQuality', count(*) filter (where status = 'retirado' and quality_status = 'pendiente')) from filtered)
    ) from meta
  );
end;
$$;
revoke all on function public.get_operations_outsourcings_page(text, text, date, date, integer) from public, anon;
grant execute on function public.get_operations_outsourcings_page(text, text, date, date, integer) to authenticated;
commit;
