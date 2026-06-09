create index if not exists products_name_idx on public.products (name);
create index if not exists products_active_name_idx on public.products (is_active, name);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_stock_idx on public.products (stock);

create index if not exists sales_sold_at_idx on public.sales (sold_at desc);
create index if not exists sales_created_by_idx on public.sales (created_by);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);
create index if not exists sale_payments_sale_id_idx on public.sale_payments (sale_id);

create index if not exists expenses_expense_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_payment_method_idx on public.expenses (payment_method);

create index if not exists repairs_created_at_idx on public.repairs (created_at desc);
create index if not exists repairs_status_idx on public.repairs (status);

create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create index if not exists invoices_status_created_at_idx on public.invoices (status, created_at desc);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
