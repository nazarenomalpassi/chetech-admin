create index if not exists visits_created_by_idx on public.visits (created_by);

drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_insert_own_technician on public.profiles;
create policy profiles_insert_by_role
  on public.profiles for insert to authenticated
  with check (
    (select private.is_admin())
    or (id = (select auth.uid()) and role = 'tecnico')
  );
create policy profiles_admin_update
  on public.profiles for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy profiles_admin_delete
  on public.profiles for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_insert
  on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy categories_admin_update
  on public.categories for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy categories_admin_delete
  on public.categories for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists products_admin_write on public.products;
create policy products_admin_insert
  on public.products for insert to authenticated
  with check ((select private.is_admin()));
create policy products_admin_update
  on public.products for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy products_admin_delete
  on public.products for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists visits_admin_all on public.visits;
drop policy if exists visits_technician_update on public.visits;
create policy visits_admin_insert
  on public.visits for insert to authenticated
  with check ((select private.is_admin()));
create policy visits_update_by_role
  on public.visits for update to authenticated
  using ((select private.is_admin()) or (select private.is_technician()))
  with check ((select private.is_admin()) or (select private.is_technician()));
create policy visits_admin_delete
  on public.visits for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_customers_admin_write on public.repair_access_customers;
create policy repair_access_customers_admin_insert
  on public.repair_access_customers for insert to authenticated
  with check ((select private.is_admin()));
create policy repair_access_customers_admin_update
  on public.repair_access_customers for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy repair_access_customers_admin_delete
  on public.repair_access_customers for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_devices_admin_write on public.repair_access_devices;
create policy repair_access_devices_admin_insert
  on public.repair_access_devices for insert to authenticated
  with check ((select private.is_admin()));
create policy repair_access_devices_admin_update
  on public.repair_access_devices for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy repair_access_devices_admin_delete
  on public.repair_access_devices for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_orders_admin_all on public.repair_access_orders;
drop policy if exists repair_access_orders_technician_update on public.repair_access_orders;
create policy repair_access_orders_admin_insert
  on public.repair_access_orders for insert to authenticated
  with check ((select private.is_admin()));
create policy repair_access_orders_update_by_role
  on public.repair_access_orders for update to authenticated
  using ((select private.is_admin()) or (select private.is_technician()))
  with check ((select private.is_admin()) or (select private.is_technician()));
create policy repair_access_orders_admin_delete
  on public.repair_access_orders for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists repair_access_status_history_admin_all on public.repair_access_status_history;
drop policy if exists repair_access_status_history_technician_insert on public.repair_access_status_history;
create policy repair_access_status_history_insert_by_role
  on public.repair_access_status_history for insert to authenticated
  with check (
    (select private.is_admin())
    or ((select private.is_technician()) and changed_by = (select auth.uid()))
  );
create policy repair_access_status_history_admin_update
  on public.repair_access_status_history for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy repair_access_status_history_admin_delete
  on public.repair_access_status_history for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists audit_logs_admin_all on public.audit_logs;
drop policy if exists audit_logs_technician_insert_own on public.audit_logs;
create policy audit_logs_admin_select
  on public.audit_logs for select to authenticated
  using ((select private.is_admin()));
create policy audit_logs_insert_by_role
  on public.audit_logs for insert to authenticated
  with check (
    (select private.is_admin())
    or ((select private.is_technician()) and user_id = (select auth.uid()))
  );
create policy audit_logs_admin_update
  on public.audit_logs for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy audit_logs_admin_delete
  on public.audit_logs for delete to authenticated
  using ((select private.is_admin()));
