-- Role-based access for the Chetech admin and technician workspaces.

create schema if not exists private;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role set default 'tecnico';

update public.profiles
set role = 'tecnico'
where role = 'empleado';

insert into public.profiles (id, full_name, role)
select
  users.id,
  coalesce(users.raw_user_meta_data->>'full_name', users.email, 'Tecnico'),
  'tecnico'
from auth.users as users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'tecnico'));

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Tecnico'),
    'tecnico'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when profiles.role = 'admin' then 'admin'
    else 'tecnico'
  end
  from public.profiles as profiles
  where profiles.id = (select auth.uid());
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) = 'admin', false);
$$;

create or replace function private.is_technician()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) = 'tecnico', false);
$$;

create or replace function private.can_access_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) in ('admin', 'tecnico'), false);
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_technician() from public;
revoke all on function private.can_access_operations() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_technician() to authenticated;
grant execute on function private.can_access_operations() to authenticated;

-- Replace permissive authenticated policies with role-aware policies.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_settings',
    'balance_transfers',
    'cierres_caja',
    'clientes',
    'expenses',
    'installment_sales',
    'installments',
    'invoice_items',
    'invoice_payments',
    'invoices',
    'movimientos_caja',
    'movimientos_stock',
    'repair_access_budgets',
    'repair_access_import_batches',
    'repair_access_import_rows',
    'repair_access_payments',
    'repair_outsourcings',
    'repair_payments',
    'repairs',
    'salary_withdrawals',
    'sale_items',
    'sale_payments',
    'sales',
    'stock_movements',
    'tv_boards'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      table_name || '_admin_all',
      table_name
    );
  end loop;
end;
$$;

alter table public.profiles enable row level security;
create policy profiles_select_own_or_admin
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_admin_all
  on public.profiles for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy profiles_insert_own_technician
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and role = 'tecnico');

alter table public.categories enable row level security;
create policy categories_operational_read
  on public.categories for select to authenticated
  using ((select private.can_access_operations()));
create policy categories_admin_write
  on public.categories for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter table public.products enable row level security;
create policy products_operational_read
  on public.products for select to authenticated
  using ((select private.can_access_operations()));
create policy products_admin_write
  on public.products for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter table public.visits enable row level security;
create policy visits_operational_read
  on public.visits for select to authenticated
  using ((select private.can_access_operations()));
create policy visits_admin_all
  on public.visits for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy visits_technician_update
  on public.visits for update to authenticated
  using ((select private.is_technician()))
  with check ((select private.is_technician()));

alter table public.repair_access_customers enable row level security;
create policy repair_access_customers_operational_read
  on public.repair_access_customers for select to authenticated
  using ((select private.can_access_operations()));
create policy repair_access_customers_admin_write
  on public.repair_access_customers for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter table public.repair_access_devices enable row level security;
create policy repair_access_devices_operational_read
  on public.repair_access_devices for select to authenticated
  using ((select private.can_access_operations()));
create policy repair_access_devices_admin_write
  on public.repair_access_devices for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter table public.repair_access_orders enable row level security;
create policy repair_access_orders_operational_read
  on public.repair_access_orders for select to authenticated
  using ((select private.can_access_operations()));
create policy repair_access_orders_admin_all
  on public.repair_access_orders for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy repair_access_orders_technician_update
  on public.repair_access_orders for update to authenticated
  using ((select private.is_technician()))
  with check ((select private.is_technician()));

alter table public.repair_access_status_history enable row level security;
create policy repair_access_status_history_operational_read
  on public.repair_access_status_history for select to authenticated
  using ((select private.can_access_operations()));
create policy repair_access_status_history_admin_all
  on public.repair_access_status_history for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy repair_access_status_history_technician_insert
  on public.repair_access_status_history for insert to authenticated
  with check ((select private.is_technician()) and changed_by = (select auth.uid()));

alter table public.audit_logs enable row level security;
create policy audit_logs_admin_all
  on public.audit_logs for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy audit_logs_technician_insert_own
  on public.audit_logs for insert to authenticated
  with check ((select private.is_technician()) and user_id = (select auth.uid()));

create or replace function private.enforce_technician_repair_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_columns text[] := array[
    'status',
    'technical_diagnosis',
    'repair_progress',
    'internal_observations',
    'used_parts',
    'work_performed',
    'budget_amount',
    'budget_detail',
    'approved_amount',
    'final_amount',
    'reviewed_at',
    'budgeted_at',
    'approved_at',
    'repair_started_at',
    'finished_at',
    'budget_response_notes',
    'budget_response_at',
    'technician_name',
    'technician_id',
    'updated_by',
    'updated_at'
  ];
begin
  if (select private.is_technician()) then
    if (to_jsonb(new) - allowed_columns) is distinct from (to_jsonb(old) - allowed_columns) then
      raise exception 'El rol tecnico no puede modificar datos administrativos de la orden.'
        using errcode = '42501';
    end if;

    if new.updated_by is distinct from (select auth.uid()) then
      raise exception 'La actualizacion tecnica debe identificar al usuario actual.'
        using errcode = '42501';
    end if;

    if new.technician_id is distinct from old.technician_id
      and new.technician_id is distinct from (select auth.uid()) then
      raise exception 'Un tecnico solo puede asignarse una orden a si mismo.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_technician_repair_update on public.repair_access_orders;
create trigger enforce_technician_repair_update
before update on public.repair_access_orders
for each row execute function private.enforce_technician_repair_update();

create or replace function private.enforce_technician_visit_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_columns text[] := array['status', 'notes', 'updated_at'];
begin
  if (select private.is_technician())
    and (to_jsonb(new) - allowed_columns) is distinct from (to_jsonb(old) - allowed_columns) then
    raise exception 'El rol tecnico solo puede modificar estado y observaciones de una visita.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_technician_visit_update on public.visits;
create trigger enforce_technician_visit_update
before update on public.visits
for each row execute function private.enforce_technician_visit_update();

comment on function private.current_app_role() is
  'Returns the role stored in public.profiles for the authenticated user.';
comment on function private.enforce_technician_repair_update() is
  'Prevents technicians from changing intake, payment, warranty, or ownership data.';
comment on function private.enforce_technician_visit_update() is
  'Limits technician visit changes to status, notes, and timestamp.';
