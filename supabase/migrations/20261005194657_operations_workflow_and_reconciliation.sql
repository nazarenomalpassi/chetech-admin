-- Additive operations only. No payment, movement, balance or repair-order changes.
begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions, pg_catalog;

alter table public.visits
  add column technician_id uuid references public.profiles(id) on delete set null,
  add column technician_name text,
  add column repair_access_order_id uuid references public.repair_access_orders(id) on delete restrict,
  add constraint visits_valid_time_range check (time_to > time_from) not valid,
  add constraint visits_technician_no_overlap exclude using gist (
    technician_id with =,
    tsrange(visit_date + time_from, visit_date + time_to, '[)') with &&
  ) where (technician_id is not null and status in ('pendiente', 'confirmada', 'en_camino'));

create index visits_repair_access_order_idx on public.visits(repair_access_order_id);

alter table public.repair_outsourcings
  add column responsible_name text,
  add column promised_at date,
  add column expected_cost numeric(12,2) check (expected_cost >= 0),
  add column actual_cost numeric(12,2) check (actual_cost >= 0),
  add column quality_status text not null default 'pendiente' check (quality_status in ('pendiente', 'aprobado', 'observado')),
  add column quality_notes text,
  add column quality_checked_at timestamptz,
  add column quality_checked_by uuid references public.profiles(id) on delete set null,
  add constraint outsourcing_promised_after_dispatch check (promised_at is null or promised_at >= sent_at) not valid,
  add constraint outsourcing_return_after_dispatch check (retrieved_at is null or retrieved_at >= sent_at) not valid;

create index repair_outsourcings_promised_active_idx on public.repair_outsourcings(promised_at) where status = 'en_taller';

alter table public.tv_boards
  add column acquisition_cost numeric(12,2) check (acquisition_cost >= 0);

-- An immutable close is its own audit evidence: actor, time and all three accounts.
-- Additional counts use a new business date; old closes cannot be overwritten.
create table public.operations_cash_reconciliations (
  id uuid primary key,
  business_date date not null unique,
  accounts jsonb not null check (jsonb_typeof(accounts) = 'array' and jsonb_array_length(accounts) = 3),
  observations text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.operations_cash_reconciliations enable row level security;
revoke all on public.operations_cash_reconciliations from anon, authenticated;
grant select, insert on public.operations_cash_reconciliations to authenticated;
create policy operations_cash_reconciliations_admin_read on public.operations_cash_reconciliations
  for select to authenticated using ((select role from public.profiles where id = (select auth.uid())) = 'admin');
create policy operations_cash_reconciliations_admin_insert on public.operations_cash_reconciliations
  for insert to authenticated with check (
    created_by = (select auth.uid()) and
    (select role from public.profiles where id = (select auth.uid())) = 'admin'
  );

create function public.validate_operations_cash_reconciliation()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  account jsonb;
  seen text[] := '{}';
begin
  if tg_op <> 'INSERT' then
    raise exception 'Los arqueos cerrados son inmutables.' using errcode = '23514';
  end if;
  for account in select value from jsonb_array_elements(new.accounts) loop
    if account->>'method' is null or account->>'method' not in ('efectivo', 'nx', 'mp')
       or account->>'method' = any(seen)
       or jsonb_typeof(account->'expected') is distinct from 'number'
       or jsonb_typeof(account->'physical') is distinct from 'number'
       or jsonb_typeof(account->'difference') is distinct from 'number' then
      raise exception 'Arqueo por cuenta invalido.' using errcode = '23514';
    end if;
    if (account->>'physical')::numeric < 0
       or (account->>'difference')::numeric <> round((account->>'physical')::numeric - (account->>'expected')::numeric, 2)
       or ((account->>'difference')::numeric <> 0 and coalesce(length(trim(account->>'reason')), 0) < 3) then
      raise exception 'Justifica la diferencia del arqueo.' using errcode = '23514';
    end if;
    seen := array_append(seen, account->>'method');
  end loop;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger operations_cash_reconciliation_validate
before insert or update or delete on public.operations_cash_reconciliations
for each row execute function public.validate_operations_cash_reconciliation();
revoke all on function public.validate_operations_cash_reconciliation() from public;

commit;
