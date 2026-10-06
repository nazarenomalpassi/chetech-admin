create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists cierres_caja_created_by_idx on public.cierres_caja (created_by);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists installment_sales_created_by_idx on public.installment_sales (created_by);

create index if not exists invoice_items_product_id_idx on public.invoice_items (product_id);
create index if not exists invoice_items_repair_id_idx on public.invoice_items (repair_id);
create index if not exists invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);
create index if not exists invoices_created_by_idx on public.invoices (created_by);
create index if not exists invoices_repair_id_idx on public.invoices (repair_id);
create index if not exists invoices_sale_id_idx on public.invoices (sale_id);

create index if not exists movimientos_caja_created_by_idx on public.movimientos_caja (created_by);
create index if not exists movimientos_stock_created_by_idx on public.movimientos_stock (created_by);
create index if not exists repair_outsourcings_created_by_idx on public.repair_outsourcings (created_by);
create index if not exists repair_outsourcings_updated_by_idx on public.repair_outsourcings (updated_by);
create index if not exists repairs_cliente_id_idx on public.repairs (cliente_id);
create index if not exists salary_withdrawals_created_by_idx on public.salary_withdrawals (created_by);
create index if not exists sales_cliente_id_idx on public.sales (cliente_id);
create index if not exists stock_movements_product_id_idx on public.stock_movements (product_id);

drop policy if exists repair_outsourcings_authenticated_manage on public.repair_outsourcings;

create policy repair_outsourcings_authenticated_manage
on public.repair_outsourcings
for all
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
