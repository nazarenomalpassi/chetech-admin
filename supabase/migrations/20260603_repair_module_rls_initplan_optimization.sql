drop policy if exists repairs_authenticated_manage on public.repairs;
create policy repairs_authenticated_manage
  on public.repairs
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_payments_authenticated_manage on public.repair_payments;
create policy repair_payments_authenticated_manage
  on public.repair_payments
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_customers_authenticated_manage on public.repair_access_customers;
create policy repair_access_customers_authenticated_manage
  on public.repair_access_customers
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_devices_authenticated_manage on public.repair_access_devices;
create policy repair_access_devices_authenticated_manage
  on public.repair_access_devices
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_orders_authenticated_manage on public.repair_access_orders;
create policy repair_access_orders_authenticated_manage
  on public.repair_access_orders
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_status_history_authenticated_manage on public.repair_access_status_history;
create policy repair_access_status_history_authenticated_manage
  on public.repair_access_status_history
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_payments_authenticated_manage on public.repair_access_payments;
create policy repair_access_payments_authenticated_manage
  on public.repair_access_payments
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_budgets_authenticated_manage on public.repair_access_budgets;
create policy repair_access_budgets_authenticated_manage
  on public.repair_access_budgets
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_import_batches_authenticated_manage on public.repair_access_import_batches;
create policy repair_access_import_batches_authenticated_manage
  on public.repair_access_import_batches
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists repair_access_import_rows_authenticated_manage on public.repair_access_import_rows;
create policy repair_access_import_rows_authenticated_manage
  on public.repair_access_import_rows
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
