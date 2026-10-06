-- Keep the current opening balances and cutoff readable, but immutable to app sessions.
-- Other app_settings keys retain the existing administrator write policy.
drop policy if exists app_settings_cash_runtime_no_insert on public.app_settings;
create policy app_settings_cash_runtime_no_insert
on public.app_settings as restrictive for insert to authenticated
with check (key <> 'cash_runtime');

drop policy if exists app_settings_cash_runtime_no_update on public.app_settings;
create policy app_settings_cash_runtime_no_update
on public.app_settings as restrictive for update to authenticated
using (key <> 'cash_runtime')
with check (key <> 'cash_runtime');

drop policy if exists app_settings_cash_runtime_no_delete on public.app_settings;
create policy app_settings_cash_runtime_no_delete
on public.app_settings as restrictive for delete to authenticated
using (key <> 'cash_runtime');
