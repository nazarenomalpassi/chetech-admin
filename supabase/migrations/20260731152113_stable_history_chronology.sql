-- Stable chronological histories for sales, expenses and repairs.
-- Business dates remain separate from immutable database creation timestamps.
-- Applied to production with migration version 20260731152113.

alter table if exists public.sales
  add column if not exists updated_at timestamptz;

alter table if exists public.expenses
  add column if not exists updated_at timestamptz;

alter table if exists public.repairs
  add column if not exists entry_date date;

-- Preserve the date previously shown by the repairs UI before repairing created_at.
update public.repairs r
set entry_date = coalesce(
  (
    select o.intake_date
    from public.repair_access_orders o
    where o.id = r.repair_access_order_id
  ),
  (r.created_at at time zone 'UTC')::date,
  (now() at time zone 'America/Argentina/Cordoba')::date
)
where r.entry_date is null;

-- For application-created repairs, the audit insert is the only reliable exact
-- timestamp when the old code stored the selected date at midnight in created_at.
with first_insert_audit as (
  select
    entity_id,
    min(created_at) as audited_created_at
  from public.audit_logs
  where entity_type = 'repairs'
    and action = 'insert'
  group by entity_id
)
update public.repairs r
set created_at = a.audited_created_at
from first_insert_audit a
where a.entity_id = r.id::text
  and (
    (r.created_at at time zone 'UTC')::time = time '00:00:00'
    or (r.created_at at time zone 'UTC')::time = time '03:00:00'
  );

update public.sales
set updated_at = created_at
where updated_at is null;

update public.expenses
set updated_at = created_at
where updated_at is null;

update public.sales
set created_at = coalesce(sold_at, now())
where created_at is null;

update public.expenses
set created_at = coalesce(
  expense_date::timestamp at time zone 'America/Argentina/Cordoba',
  now()
)
where created_at is null;

update public.repairs
set created_at = coalesce(
  entry_date::timestamp at time zone 'America/Argentina/Cordoba',
  now()
)
where created_at is null;

update public.repair_access_orders
set created_at = coalesce(
  intake_date::timestamp at time zone 'America/Argentina/Cordoba',
  now()
)
where created_at is null;

alter table public.sales
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.expenses
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.repairs
  alter column entry_date set default ((now() at time zone 'America/Argentina/Cordoba')::date),
  alter column entry_date set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.repair_access_orders
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
declare
  invalid_column text;
begin
  select format('%I.%I', table_name, column_name)
  into invalid_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('sales', 'expenses', 'repairs', 'repair_access_orders')
    and column_name in ('created_at', 'updated_at')
    and data_type <> 'timestamp with time zone'
  limit 1;

  if invalid_column is not null then
    raise exception 'Timestamp column % is not timestamptz; migration stopped safely.', invalid_column;
  end if;
end;
$$;

create schema if not exists private;

create or replace function private.set_row_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
before update on public.sales
for each row execute function private.set_row_updated_at();

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function private.set_row_updated_at();

drop trigger if exists repairs_set_updated_at on public.repairs;
create trigger repairs_set_updated_at
before update on public.repairs
for each row execute function private.set_row_updated_at();

drop trigger if exists repair_access_orders_set_updated_at on public.repair_access_orders;
create trigger repair_access_orders_set_updated_at
before update on public.repair_access_orders
for each row execute function private.set_row_updated_at();

create index if not exists sales_created_at_id_idx
  on public.sales (created_at desc, id desc);

create index if not exists expenses_created_at_id_idx
  on public.expenses (created_at desc, id desc);

create index if not exists repairs_created_at_id_idx
  on public.repairs (created_at desc, id desc);

create index if not exists repairs_entry_date_idx
  on public.repairs (entry_date desc);

create index if not exists repair_access_orders_created_at_id_idx
  on public.repair_access_orders (created_at desc, id desc);

-- Keep the existing RPC payloads and permissions intact; only replace their
-- ordering clause so desktop and technician/mobile views share the same order.
do $$
declare
  function_definition text;
begin
  if to_regprocedure('public.get_technician_repair_orders(uuid)') is not null then
    select pg_get_functiondef(to_regprocedure('public.get_technician_repair_orders(uuid)'))
    into function_definition;

    if position('order by o.created_at desc, o.id desc' in function_definition) = 0 then
      function_definition := replace(
        function_definition,
        'order by o.created_at desc',
        'order by o.created_at desc, o.id desc'
      );
      execute function_definition;
    end if;
  end if;

  if to_regprocedure('public.get_technician_repair_dashboard_orders()') is not null then
    select pg_get_functiondef(to_regprocedure('public.get_technician_repair_dashboard_orders()'))
    into function_definition;

    if position('order by o.created_at desc, o.id desc' in function_definition) = 0 then
      function_definition := replace(
        function_definition,
        'order by o.intake_date desc, o.created_at desc',
        'order by o.created_at desc, o.id desc'
      );
      execute function_definition;
    end if;
  end if;
end;
$$;
