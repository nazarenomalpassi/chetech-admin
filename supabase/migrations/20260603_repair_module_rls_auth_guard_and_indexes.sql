create or replace function public.generate_repair_access_number()
returns text
language sql
set search_path = public, pg_temp
as $$
  select 'REP-' || lpad(nextval('public.repair_access_order_number_seq')::text, 6, '0');
$$;

grant execute on function public.generate_repair_access_number() to authenticated, service_role;

drop policy if exists repairs_authenticated_manage on public.repairs;
create policy repairs_authenticated_manage
  on public.repairs
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_payments_authenticated_manage on public.repair_payments;
create policy repair_payments_authenticated_manage
  on public.repair_payments
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_customers_authenticated_manage on public.repair_access_customers;
create policy repair_access_customers_authenticated_manage
  on public.repair_access_customers
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_devices_authenticated_manage on public.repair_access_devices;
create policy repair_access_devices_authenticated_manage
  on public.repair_access_devices
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_orders_authenticated_manage on public.repair_access_orders;
create policy repair_access_orders_authenticated_manage
  on public.repair_access_orders
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_status_history_authenticated_manage on public.repair_access_status_history;
create policy repair_access_status_history_authenticated_manage
  on public.repair_access_status_history
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_payments_authenticated_manage on public.repair_access_payments;
create policy repair_access_payments_authenticated_manage
  on public.repair_access_payments
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_budgets_authenticated_manage on public.repair_access_budgets;
create policy repair_access_budgets_authenticated_manage
  on public.repair_access_budgets
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_import_batches_authenticated_manage on public.repair_access_import_batches;
create policy repair_access_import_batches_authenticated_manage
  on public.repair_access_import_batches
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists repair_access_import_rows_authenticated_manage on public.repair_access_import_rows;
create policy repair_access_import_rows_authenticated_manage
  on public.repair_access_import_rows
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists repairs_created_by_idx
  on public.repairs (created_by);

create index if not exists repair_payments_repair_id_idx
  on public.repair_payments (repair_id);

create index if not exists repair_access_customers_created_by_idx
  on public.repair_access_customers (created_by);

create index if not exists repair_access_devices_created_by_idx
  on public.repair_access_devices (created_by);

create index if not exists repair_access_devices_updated_by_idx
  on public.repair_access_devices (updated_by);

create index if not exists repair_access_orders_created_by_idx
  on public.repair_access_orders (created_by);

create index if not exists repair_access_orders_updated_by_idx
  on public.repair_access_orders (updated_by);

create index if not exists repair_access_status_history_changed_by_idx
  on public.repair_access_status_history (changed_by);

create index if not exists repair_access_payments_created_by_idx
  on public.repair_access_payments (created_by);

create index if not exists repair_access_budgets_created_by_idx
  on public.repair_access_budgets (created_by);

create index if not exists repair_access_import_batches_created_by_idx
  on public.repair_access_import_batches (created_by);

create index if not exists repair_access_import_rows_customer_id_idx
  on public.repair_access_import_rows (customer_id);
