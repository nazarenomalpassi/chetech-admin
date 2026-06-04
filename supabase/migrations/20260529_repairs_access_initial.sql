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
