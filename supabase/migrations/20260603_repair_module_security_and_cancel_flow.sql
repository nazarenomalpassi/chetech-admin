create extension if not exists pg_trgm with schema extensions;

create index if not exists repair_access_customers_full_name_trgm_idx
  on public.repair_access_customers using gin (full_name gin_trgm_ops);

create index if not exists repair_access_customers_phone_trgm_idx
  on public.repair_access_customers using gin (phone gin_trgm_ops);

create index if not exists repair_access_customers_alternate_phone_trgm_idx
  on public.repair_access_customers using gin (alternate_phone gin_trgm_ops);

create index if not exists repair_access_customers_dni_trgm_idx
  on public.repair_access_customers using gin (dni gin_trgm_ops);

create index if not exists repair_access_customers_phone_normalized_trgm_idx
  on public.repair_access_customers using gin (phone_normalized gin_trgm_ops);

create index if not exists repair_access_customers_alternate_phone_normalized_trgm_idx
  on public.repair_access_customers using gin (alternate_phone_normalized gin_trgm_ops);

alter table public.repairs enable row level security;
alter table public.repair_payments enable row level security;
alter table public.repair_access_customers enable row level security;
alter table public.repair_access_devices enable row level security;
alter table public.repair_access_orders enable row level security;
alter table public.repair_access_status_history enable row level security;
alter table public.repair_access_payments enable row level security;
alter table public.repair_access_budgets enable row level security;
alter table public.repair_access_import_batches enable row level security;
alter table public.repair_access_import_rows enable row level security;

drop policy if exists repairs_authenticated_manage on public.repairs;
create policy repairs_authenticated_manage
  on public.repairs
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_payments_authenticated_manage on public.repair_payments;
create policy repair_payments_authenticated_manage
  on public.repair_payments
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_customers_authenticated_manage on public.repair_access_customers;
create policy repair_access_customers_authenticated_manage
  on public.repair_access_customers
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_devices_authenticated_manage on public.repair_access_devices;
create policy repair_access_devices_authenticated_manage
  on public.repair_access_devices
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_orders_authenticated_manage on public.repair_access_orders;
create policy repair_access_orders_authenticated_manage
  on public.repair_access_orders
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_status_history_authenticated_manage on public.repair_access_status_history;
create policy repair_access_status_history_authenticated_manage
  on public.repair_access_status_history
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_payments_authenticated_manage on public.repair_access_payments;
create policy repair_access_payments_authenticated_manage
  on public.repair_access_payments
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_budgets_authenticated_manage on public.repair_access_budgets;
create policy repair_access_budgets_authenticated_manage
  on public.repair_access_budgets
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_import_batches_authenticated_manage on public.repair_access_import_batches;
create policy repair_access_import_batches_authenticated_manage
  on public.repair_access_import_batches
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists repair_access_import_rows_authenticated_manage on public.repair_access_import_rows;
create policy repair_access_import_rows_authenticated_manage
  on public.repair_access_import_rows
  for all
  to authenticated
  using (true)
  with check (true);
