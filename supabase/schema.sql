create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'empleado' check (role in ('admin', 'empleado')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sku_prefix text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  cost numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  subtotal numeric(12,2) not null default 0,
  cost_total numeric(12,2) not null default 0,
  profit_total numeric(12,2) not null default 0,
  notes text,
  sold_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  total numeric(12,2) not null
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  type text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null,
  impacts_cash boolean not null default true,
  observations text,
  is_voided boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text,
  device text not null,
  brand text,
  model text,
  issue_description text not null,
  diagnosis text,
  estimated_price numeric(12,2),
  final_price numeric(12,2),
  internal_cost numeric(12,2),
  observations text,
  status text not null default 'ingresado' check (
    status in (
      'ingresado',
      'en_diagnostico',
      'esperando_repuestos',
      'en_reparacion',
      'listo',
      'entregado',
      'cancelado'
    )
  ),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repair_payments (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs(id) on delete cascade,
  payment_date date not null default current_date,
  method text not null,
  amount numeric(12,2) not null check (amount > 0),
  notes text
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('sale', 'adjustment', 'purchase', 'import')),
  quantity integer not null,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null default '{}'::jsonb,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_name text not null,
  customer_phone text,
  source_type text not null default 'manual' check (source_type in ('manual', 'repair', 'sale')),
  repair_id uuid references public.repairs(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente', 'parcial', 'pagado', 'anulado')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total numeric(12,2) not null check (total >= 0),
  product_id uuid references public.products(id) on delete set null,
  repair_id uuid references public.repairs(id) on delete set null
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_date date not null default current_date,
  method text not null check (method in ('efectivo', 'nx', 'mp', 'transferencia', 'otro')),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.get_top_products(date_from timestamptz, date_to timestamptz)
returns table (name text, quantity bigint)
language sql
as $$
  select p.name, sum(si.quantity)::bigint as quantity
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  join public.products p on p.id = si.product_id
  where s.sold_at between date_from and date_to
  group by p.name
  order by quantity desc
  limit 5;
$$;

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

create table if not exists public.repair_access_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  dni text,
  email text,
  address text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists repair_access_customers_dni_key
  on public.repair_access_customers (dni)
  where dni is not null and btrim(dni) <> '';

create index if not exists repair_access_customers_full_name_idx
  on public.repair_access_customers (lower(full_name));

create index if not exists repair_access_customers_phone_idx
  on public.repair_access_customers (phone);

create table if not exists public.repair_access_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.repair_access_customers(id) on delete cascade,
  device_type text not null,
  brand text,
  model text,
  serial_number text,
  accessory_details text,
  visual_condition text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repair_access_devices_customer_idx
  on public.repair_access_devices (customer_id);

create index if not exists repair_access_devices_serial_idx
  on public.repair_access_devices (serial_number);

create table if not exists public.repair_access_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.repair_access_customers(id) on delete restrict,
  device_id uuid not null references public.repair_access_devices(id) on delete restrict,
  intake_date date not null default current_date,
  issue_reported text not null,
  technical_diagnosis text,
  budget_amount numeric(12,2),
  approved_amount numeric(12,2),
  final_amount numeric(12,2),
  payment_method text,
  payment_notes text,
  is_paid boolean not null default false,
  paid_at timestamptz,
  delivered_at timestamptz,
  warranty_until date,
  notes text,
  priority text,
  status text not null default 'ingresado'
    check (
      status in (
        'ingresado',
        'en_revision',
        'presupuestado',
        'aprobado',
        'rechazado',
        'en_reparacion',
        'terminado',
        'entregado',
        'cobrado',
        'dado_de_baja'
      )
    ),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_access_orders_budget_amount_check
    check (budget_amount is null or budget_amount >= 0),
  constraint repair_access_orders_approved_amount_check
    check (approved_amount is null or approved_amount >= 0),
  constraint repair_access_orders_final_amount_check
    check (final_amount is null or final_amount >= 0),
  constraint repair_access_orders_payment_method_check
    check (
      payment_method is null
      or payment_method in ('efectivo', 'nx', 'mp', 'transferencia', 'otro')
    ),
  constraint repair_access_orders_paid_fields_check
    check (
      (is_paid = false and paid_at is null)
      or (is_paid = true and paid_at is not null)
    )
);

create index if not exists repair_access_orders_customer_idx
  on public.repair_access_orders (customer_id);

create index if not exists repair_access_orders_device_idx
  on public.repair_access_orders (device_id);

create index if not exists repair_access_orders_status_idx
  on public.repair_access_orders (status);

create index if not exists repair_access_orders_intake_date_idx
  on public.repair_access_orders (intake_date desc);

create table if not exists public.repair_access_status_history (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid not null references public.repair_access_orders(id) on delete cascade,
  previous_status text,
  next_status text not null
    check (
      next_status in (
        'ingresado',
        'en_revision',
        'presupuestado',
        'aprobado',
        'rechazado',
        'en_reparacion',
        'terminado',
        'entregado',
        'cobrado',
        'dado_de_baja'
      )
    ),
  changed_by uuid references public.profiles(id) on delete set null,
  notes text,
  changed_at timestamptz not null default now()
);

create index if not exists repair_access_status_history_order_idx
  on public.repair_access_status_history (repair_order_id, changed_at desc);

create table if not exists public.repair_access_payments (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid not null references public.repair_access_orders(id) on delete cascade,
  payment_date date not null default current_date,
  method text not null
    check (method in ('efectivo', 'nx', 'mp', 'transferencia', 'otro')),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists repair_access_payments_order_idx
  on public.repair_access_payments (repair_order_id, payment_date desc);

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

create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_number integer;
begin
  select coalesce(max(substring(invoice_number from '^FAC-([0-9]+)$')::integer), 0) + 1
  into v_next_number
  from public.invoices
  where invoice_number ~ '^FAC-[0-9]+$';

  return 'FAC-' || lpad(v_next_number::text, 4, '0');
end;
$$;

create or replace function public.create_invoice_with_number(
  p_customer_name text,
  p_customer_phone text,
  p_source_type text,
  p_repair_id uuid,
  p_sale_id uuid,
  p_discount numeric,
  p_notes text,
  p_created_by uuid
)
returns table (id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('invoice_number'));
  v_number := public.next_invoice_number();

  insert into public.invoices (
    invoice_number,
    customer_name,
    customer_phone,
    source_type,
    repair_id,
    sale_id,
    discount,
    notes,
    created_by
  )
  values (
    v_number,
    p_customer_name,
    nullif(p_customer_phone, ''),
    p_source_type,
    p_repair_id,
    p_sale_id,
    coalesce(p_discount, 0),
    nullif(p_notes, ''),
    p_created_by
  )
  returning invoices.id into v_id;

  return query select v_id, v_number;
end;
$$;

create or replace function public.refresh_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_status text;
begin
  select coalesce(sum(total), 0)
  into v_subtotal
  from public.invoice_items
  where invoice_id = p_invoice_id;

  select coalesce(discount, 0)
  into v_discount
  from public.invoices
  where id = p_invoice_id;

  select coalesce(sum(amount), 0)
  into v_paid
  from public.invoice_payments
  where invoice_id = p_invoice_id;

  v_total := greatest(v_subtotal - v_discount, 0);

  select case
    when status = 'anulado' then 'anulado'
    when v_paid <= 0 then 'pendiente'
    when v_paid < v_total then 'parcial'
    else 'pagado'
  end
  into v_status
  from public.invoices
  where id = p_invoice_id;

  update public.invoices
  set
    subtotal = v_subtotal,
    total = v_total,
    paid_total = v_paid,
    balance = greatest(v_total - v_paid, 0),
    status = v_status,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;
