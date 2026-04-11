alter table public.categories
add column if not exists sku_prefix text;

create unique index if not exists categories_sku_prefix_unique
on public.categories (sku_prefix)
where sku_prefix is not null;

create or replace function public.next_product_sku(p_category_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next_number integer;
begin
  select sku_prefix into v_prefix
  from public.categories
  where id = p_category_id;

  if v_prefix is null or length(trim(v_prefix)) = 0 then
    raise exception 'La categoría no tiene prefijo SKU configurado.';
  end if;

  select coalesce(max(substring(sku from '^[A-Z]+-([0-9]+)$')::integer), 0) + 1
  into v_next_number
  from public.products
  where category_id = p_category_id
    and sku ~ ('^' || v_prefix || '-[0-9]+$');

  return v_prefix || '-' || lpad(v_next_number::text, 3, '0');
end;
$$;

create or replace function public.create_product_with_generated_sku(
  p_name text,
  p_category_id uuid,
  p_cost numeric,
  p_sale_price numeric,
  p_stock integer,
  p_min_stock integer,
  p_is_active boolean,
  p_notes text
)
returns table (id uuid, sku text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text;
  v_prefix text;
  v_id uuid;
begin
  select sku_prefix into v_prefix
  from public.categories
  where categories.id = p_category_id;

  if v_prefix is null or length(trim(v_prefix)) = 0 then
    raise exception 'La categoría no tiene prefijo SKU configurado.';
  end if;

  perform pg_advisory_xact_lock(hashtext('product_sku_' || p_category_id::text));

  v_sku := public.next_product_sku(p_category_id);

  insert into public.products (
    sku,
    name,
    category_id,
    cost,
    sale_price,
    stock,
    min_stock,
    is_active,
    notes
  )
  values (
    v_sku,
    p_name,
    p_category_id,
    coalesce(p_cost, 0),
    coalesce(p_sale_price, 0),
    coalesce(p_stock, 0),
    coalesce(p_min_stock, 0),
    coalesce(p_is_active, true),
    nullif(p_notes, '')
  )
  returning products.id into v_id;

  return query select v_id, v_sku;
end;
$$;

update public.categories
set sku_prefix = case slug
  when 'adaptadores' then 'ADA'
  when 'auriculares' then 'AUR'
  when 'cables' then 'CAB'
  when 'cargadores' then 'CAR'
  when 'freidoras' then 'FRE'
  when 'iluminacion' then 'ILU'
  when 'parlantes' then 'PAR'
  when 'pendrives' then 'PEN'
  when 'pilas_y_baterias' then 'PIL'
  when 'reparacion' then 'REP'
  when 'teclados_y_mouse' then 'TEC'
  when 'televisores' then 'TEL'
  when 'vapers' then 'VAP'
  when 'varios' then 'VAR'
  else sku_prefix
end
where sku_prefix is null;
