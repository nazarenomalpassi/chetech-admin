-- CHETECH release baseline. Read-only, no DDL, no credential or personal-data output.
-- Run unchanged before and after the 19-migration upgrade, in a quiet write window.
-- Fixed operational day avoids a midnight rollover changing period totals.
-- Claims apply to this transaction only, for the audited read-only admin RPCs.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local time zone 'UTC';
set local request.jwt.claims = '{"role":"service_role"}';

with
cash_rpc as materialized (
  select public.get_cash_page_snapshot('2026-10-06T00:00:00-03:00', '2026-10-07T00:00:00-03:00') as data
), salary_rpc as materialized (
  select public.get_salary_planning_snapshot('2026-10-01') as data
), legacy_paid as materialized (
  select repair_id, sum(amount) as paid from public.repair_payments group by repair_id
), native_paid as materialized (
  select repair_order_id, sum(amount) as paid from public.repair_access_payments
  where voided_at is null and legacy_repair_payment_id is null group by repair_order_id
), order_legacy_paid as materialized (
  select r.repair_access_order_id as order_id, sum(p.amount) as paid
  from public.repairs r join public.repair_payments p on p.repair_id=r.id
  where r.repair_access_order_id is not null group by r.repair_access_order_id
), repair_settlements as materialized (
  select r.id, r.repair_access_order_id, coalesce(r.final_price,r.estimated_price,0) as price,
    coalesce(lp.paid,0)+coalesce(np.paid,0) as actual_paid
  from public.repairs r left join legacy_paid lp on lp.repair_id=r.id
  left join native_paid np on np.repair_order_id=r.repair_access_order_id
), order_settlements as materialized (
  select o.id,o.is_paid,coalesce(case when o.final_amount>0 then o.final_amount end,
    case when o.approved_amount>0 then o.approved_amount end,case when o.budget_amount>0 then o.budget_amount end,0) as price,
    coalesce(np.paid,0)+coalesce(lp.paid,0) as actual_paid
  from public.repair_access_orders o left join native_paid np on np.repair_order_id=o.id
  left join order_legacy_paid lp on lp.order_id=o.id
), invoice_settlements as materialized (
  select i.id,i.source_type,i.total,i.paid_total as stored_paid,i.balance as stored_balance,i.status,
    case i.source_type
      when 'sale' then coalesce((select sum(p.amount) from public.sale_payments p where p.sale_id=i.sale_id),0)
      when 'repair' then coalesce((select actual_paid from repair_settlements r where r.id=i.repair_id),0)
      when 'repair_access' then coalesce((select actual_paid from order_settlements o where o.id=nullif(to_jsonb(i)->>'repair_access_order_id','')::uuid),0)
      when 'manual' then coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id=i.id),0)
      else 0 end as actual_paid
  from public.invoices i
), historical_rows as materialized (
  -- Remove ONLY additive release columns. Existing values/IDs/times/actors remain hashed.
  select 'products' as table_name,p.id,to_jsonb(p) as row_data from public.products p
  union all select 'sales',s.id,to_jsonb(s) from public.sales s
  union all select 'sale_items',s.id,to_jsonb(s) from public.sale_items s
  union all select 'sale_payments',s.id,to_jsonb(s) from public.sale_payments s
  union all select 'expenses',e.id,to_jsonb(e)-array['repair_order_id','part_request_id'] from public.expenses e
  union all select 'movimientos_caja',m.id,to_jsonb(m)-array['repair_payment_id','repair_projection_key','repair_projection_kind','repair_projection_baseline_id','corrects_cash_movement_id'] from public.movimientos_caja m
  union all select 'repairs',r.id,to_jsonb(r)-'financial_version' from public.repairs r
  union all select 'repair_payments',p.id,to_jsonb(p)-array['recorded_by','cash_posted_at','cash_timestamp_precision','cash_movement_id'] from public.repair_payments p
  union all select 'repair_access_payments',p.id,to_jsonb(p) from public.repair_access_payments p
  union all select 'invoices',i.id,to_jsonb(i)-array['repair_access_order_id','document_version','fiscal_provider','fiscal_reference','fiscal_issued_at','fiscal_locked_at'] from public.invoices i
  union all select 'invoice_items',i.id,to_jsonb(i)-'position' from public.invoice_items i
  union all select 'invoice_payments',i.id,to_jsonb(i) from public.invoice_payments i
  union all select 'installment_sales',i.id,to_jsonb(i) from public.installment_sales i
  union all select 'installments',i.id,to_jsonb(i)-'financial_version' from public.installments i
  union all select 'balance_transfers',b.id,to_jsonb(b) from public.balance_transfers b
  union all select 'cash_closures',c.id,to_jsonb(c) from public.cierres_caja c
  union all select 'salary_withdrawals',s.id,to_jsonb(s) from public.salary_withdrawals s
  union all select 'repair_orders_financial_custody',o.id,jsonb_build_object(
    'id',o.id,'repair_number',o.repair_number,'customer_id',o.customer_id,'device_id',o.device_id,
    'intake_date',o.intake_date,'created_at',o.created_at,'updated_at',o.updated_at,
    'budget_amount',o.budget_amount,'budget_detail',o.budget_detail,'approved_amount',o.approved_amount,'approved_at',o.approved_at,
    'final_amount',o.final_amount,'is_paid',o.is_paid,'paid_at',o.paid_at,'payment_method',o.payment_method,
    'status',o.status,'picked_up_at',o.picked_up_at,'delivered_at',o.delivered_at,
    'warranty_start',o.warranty_start,'warranty_until',o.warranty_until,'warranty_days',o.warranty_days,'warranty_active',o.warranty_active)
  from public.repair_access_orders o
), row_fingerprints as (
  select table_name,count(*) as row_count,
    encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(row_data::text,'UTF8')),'hex'),'' order by id),''),'UTF8')),'hex') as sha256
  from historical_rows group by table_name
), fingerprints as (
  select t.table_name,coalesce(f.row_count,0) as row_count,
    coalesce(f.sha256,encode(sha256(convert_to('','UTF8')),'hex')) as sha256
  from (values ('products'),('sales'),('sale_items'),('sale_payments'),('expenses'),('movimientos_caja'),('repairs'),('repair_payments'),
    ('repair_access_payments'),('invoices'),('invoice_items'),('invoice_payments'),('installment_sales'),('installments'),
    ('balance_transfers'),('cash_closures'),('salary_withdrawals'),('repair_orders_financial_custody')) t(table_name)
  left join row_fingerprints f using(table_name)
), cash_groups as (
  select tipo,medio_pago,count(*) as row_count,sum(monto) as gross_amount,
    sum(case when tipo in ('gasto','sueldo') then -monto else monto end) as signed_amount
  from public.movimientos_caja group by tipo,medio_pago
), invoice_groups as (
  select source_type,count(*) as row_count,sum(total) as total,sum(stored_paid) as stored_paid,
    sum(actual_paid) as actual_paid,sum(stored_balance) as stored_balance,
    sum(case when status='anulado' then 0 else greatest(total-actual_paid,0) end) as derived_balance,
    count(*) filter(where stored_paid<>actual_paid or stored_balance<>case when status='anulado' then 0 else greatest(total-actual_paid,0) end) as settlement_mismatches
  from invoice_settlements group by source_type
)
select jsonb_build_object(
  'snapshot_contract','chetech-financial-preservation-v1',
  'captured_at',clock_timestamp(),'read_only',current_setting('transaction_read_only'),
  'database_role',current_user,'postgres_version',current_setting('server_version'),'timezone',current_setting('TimeZone'),
  'operational_day','2026-10-06','salary_month','2026-10-01',
  'migration_count',(select count(*) from supabase_migrations.schema_migrations),
  'last_migration',(select max(version) from supabase_migrations.schema_migrations),
  'cash_runtime',(select jsonb_build_object('openingBalances',value->'openingBalances','movementCutoff',value->'movementCutoff',
    'parsedCutoff',coalesce(nullif(value->>'movementCutoff','')::timestamptz,'2026-04-16T14:21:01.222Z'::timestamptz),
    'settings_sha256',encode(sha256(convert_to(value::text,'UTF8')),'hex')) from public.app_settings where key='cash_runtime'),
  'cash_summary',(select data->'cash_summary' from cash_rpc),
  'account_balances',(select data->'accounts' from salary_rpc),
  'account_total_available',(select data->'total_available' from salary_rpc),
  'cash_groups',coalesce((select jsonb_agg(to_jsonb(c) order by tipo,medio_pago) from cash_groups c),'[]'::jsonb),
  'preserved_tables',coalesce((select jsonb_agg(to_jsonb(f) order by table_name) from fingerprints f),'[]'::jsonb),
  'stock',(select jsonb_build_object('products',count(*),'units',coalesce(sum(stock),0),'negative_stock',count(*) filter(where stock<0),
    'stock_sha256',encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(id,stock,cost,sale_price,is_active)::text,'' order by id),''),'UTF8')),'hex')) from public.products),
  'sales',(select jsonb_build_object('count',count(*),'subtotal',coalesce(sum(subtotal),0),'cost_total',coalesce(sum(cost_total),0),'profit_total',coalesce(sum(profit_total),0)) from public.sales),
  'sale_payments',(select jsonb_build_object('count',count(*),'amount',coalesce(sum(amount),0)) from public.sale_payments),
  'expenses',(select jsonb_build_object('count',count(*),'amount',coalesce(sum(amount),0),'active_amount',coalesce(sum(amount) filter(where not is_voided),0),
    'active_cash_amount',coalesce(sum(amount) filter(where not is_voided and impacts_cash),0)) from public.expenses),
  'repair_collections',jsonb_build_object(
    'legacy_payments',(select count(*) from public.repair_payments),'legacy_amount',(select coalesce(sum(amount),0) from public.repair_payments),
    'native_unmirrored_payments',(select count(*) from public.repair_access_payments where voided_at is null and legacy_repair_payment_id is null),
    'native_unmirrored_amount',(select coalesce(sum(amount),0) from public.repair_access_payments where voided_at is null and legacy_repair_payment_id is null),
    'native_mirrors',(select count(*) from public.repair_access_payments where legacy_repair_payment_id is not null),
    'linked_primary_actual_amount',(select coalesce(sum(actual_paid),0) from order_settlements),
    'primary_paid_flags_without_structured_payment',(select count(*) from order_settlements where is_paid and actual_paid=0),
    'primary_paid_flags_with_partial_payment',(select count(*) from order_settlements where is_paid and actual_paid>0 and actual_paid<price),
    'legacy_records_overpaid',(select count(*) from repair_settlements where actual_paid>price)),
  'invoice_settlement',coalesce((select jsonb_agg(to_jsonb(g) order by source_type) from invoice_groups g),'[]'::jsonb),
  'installments',(select jsonb_build_object('count',count(*),'amount',coalesce(sum(amount),0),'paid_amount',coalesce(sum(amount) filter(where status='pagada'),0),
    'pending_amount',coalesce(sum(amount) filter(where status not in ('pagada','cancelada')),0)) from public.installments),
  'migration_preflight',jsonb_build_object(
    'unsupported_invoice_sources',(select count(*) from public.invoices where source_type not in ('manual','repair','repair_access','sale')),
    'duplicate_operation_ids',(select count(*) from (select changes->>'operation_id' from public.audit_logs where changes->>'operation_id' is not null group by changes->>'operation_id' having count(*)>1) d),
    'duplicate_primary_financial_links',(select count(*) from (select repair_access_order_id from public.repairs where repair_access_order_id is not null group by repair_access_order_id having count(*)>1) d),
    'unknown_legacy_payment_methods',(select count(*) from public.repair_payments where lower(btrim(method)) not in ('efectivo','nx','nx santi','nx_santi','mp','nx local','nx_local','mercado pago')))
) as snapshot;

rollback;
