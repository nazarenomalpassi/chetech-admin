create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

alter table public.repair_access_customers
  add column if not exists full_name_normalized text;

update public.repair_access_customers
set full_name_normalized = lower(
    btrim(
      regexp_replace(
        extensions.unaccent(full_name),
        '[^0-9a-zA-Z]+',
        ' ',
        'g'
      )
    )
  )
where full_name_normalized is null
   or btrim(full_name_normalized) = '';

create index if not exists repair_access_customers_full_name_normalized_trgm_idx
  on public.repair_access_customers using gin (full_name_normalized gin_trgm_ops);
