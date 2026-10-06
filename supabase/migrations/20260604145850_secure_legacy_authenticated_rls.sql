do $$
declare
  table_name text;
  legacy_tables text[] := array[
    'profiles',
    'categories',
    'products',
    'sales',
    'sale_items',
    'sale_payments',
    'expenses',
    'repairs',
    'repair_payments',
    'stock_movements',
    'audit_logs',
    'invoices',
    'invoice_items',
    'invoice_payments',
    'clientes',
    'movimientos_caja',
    'cierres_caja',
    'movimientos_stock',
    'salary_withdrawals',
    'app_settings',
    'tv_boards',
    'installment_sales',
    'installments',
    'repair_access_customers',
    'repair_access_devices',
    'repair_access_orders',
    'repair_access_status_history',
    'repair_access_payments',
    'repair_access_budgets',
    'repair_access_import_batches',
    'repair_access_import_rows'
  ];
begin
  foreach table_name in array legacy_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon', table_name);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
      execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
      execute format(
        'drop policy if exists %I on public.%I',
        table_name || '_authenticated_manage',
        table_name
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select auth.role()) = ''authenticated'') with check ((select auth.role()) = ''authenticated'')',
        table_name || '_authenticated_manage',
        table_name
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.get_top_products(timestamp with time zone,timestamp with time zone)') is not null then
    execute 'alter function public.get_top_products(timestamptz, timestamptz) set search_path = public';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.resumen_caja_diario(date)') is not null then
    execute 'alter function public.resumen_caja_diario(date) set search_path = public';
  end if;

  if to_regprocedure('public.set_tv_boards_updated_at()') is not null then
    execute 'alter function public.set_tv_boards_updated_at() set search_path = public';
  end if;
end $$;

alter function public.next_product_sku(uuid) security invoker;
alter function public.create_product_with_generated_sku(
  text,
  uuid,
  numeric,
  numeric,
  integer,
  integer,
  boolean,
  text
) security invoker;
alter function public.next_invoice_number() security invoker;
alter function public.create_invoice_with_number(
  text,
  text,
  text,
  uuid,
  uuid,
  numeric,
  text,
  uuid
) security invoker;
alter function public.refresh_invoice_totals(uuid) security invoker;

revoke execute on function public.get_top_products(timestamptz, timestamptz) from anon, PUBLIC;
grant execute on function public.get_top_products(timestamptz, timestamptz) to authenticated, service_role;

revoke execute on function public.next_product_sku(uuid) from anon, PUBLIC;
grant execute on function public.next_product_sku(uuid) to authenticated, service_role;

revoke execute on function public.create_product_with_generated_sku(
  text,
  uuid,
  numeric,
  numeric,
  integer,
  integer,
  boolean,
  text
) from anon, PUBLIC;
grant execute on function public.create_product_with_generated_sku(
  text,
  uuid,
  numeric,
  numeric,
  integer,
  integer,
  boolean,
  text
) to authenticated, service_role;

revoke execute on function public.next_invoice_number() from anon, PUBLIC;
grant execute on function public.next_invoice_number() to authenticated, service_role;

revoke execute on function public.create_invoice_with_number(
  text,
  text,
  text,
  uuid,
  uuid,
  numeric,
  text,
  uuid
) from anon, PUBLIC;
grant execute on function public.create_invoice_with_number(
  text,
  text,
  text,
  uuid,
  uuid,
  numeric,
  text,
  uuid
) to authenticated, service_role;

revoke execute on function public.refresh_invoice_totals(uuid) from anon, PUBLIC;
grant execute on function public.refresh_invoice_totals(uuid) to authenticated, service_role;
