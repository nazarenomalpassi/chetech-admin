-- Read-only fingerprints. Exclude only the additive claim columns on tv_boards.
with preserved as (
  select 'tv_boards' relation,id::text identity,to_jsonb(t)-array['claim_status','claim_opened_at','claim_notes','claim_resolved_at','claim_resolution_notes','financial_version'] body from public.tv_boards t
  union all select 'products',id::text,to_jsonb(t) from public.products t
  union all select 'sales',id::text,to_jsonb(t) from public.sales t
  union all select 'sale_items',id::text,to_jsonb(t) from public.sale_items t
  union all select 'sale_payments',id::text,to_jsonb(t) from public.sale_payments t
  union all select 'expenses',id::text,to_jsonb(t) from public.expenses t
  union all select 'movimientos_caja',id::text,to_jsonb(t) from public.movimientos_caja t
  union all select 'app_settings',key,to_jsonb(t) from public.app_settings t
  union all select 'repairs',id::text,to_jsonb(t) from public.repairs t
  union all select 'repair_payments',id::text,to_jsonb(t) from public.repair_payments t
  union all select 'repair_access_orders',id::text,to_jsonb(t) from public.repair_access_orders t
  union all select 'repair_access_payments',id::text,to_jsonb(t) from public.repair_access_payments t
  union all select 'invoices',id::text,to_jsonb(t) from public.invoices t
  union all select 'invoice_items',id::text,to_jsonb(t) from public.invoice_items t
  union all select 'invoice_payments',id::text,to_jsonb(t) from public.invoice_payments t
  union all select 'installment_sales',id::text,to_jsonb(t) from public.installment_sales t
  union all select 'installments',id::text,to_jsonb(t) from public.installments t
  union all select 'salary_withdrawals',id::text,to_jsonb(t) from public.salary_withdrawals t
  union all select 'balance_transfers',id::text,to_jsonb(t) from public.balance_transfers t
), hashes as (
  select relation,count(*) row_count,
    encode(sha256(convert_to(string_agg(body::text,'' order by identity),'UTF8')),'hex') sha256
  from preserved group by relation
)
select coalesce(jsonb_object_agg(relation,jsonb_build_object('rowCount',row_count,'sha256',sha256)),'{}') result from hashes;
