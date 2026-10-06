alter table public.repair_access_customers
  add column if not exists alternate_phone text,
  add column if not exists phone_normalized text,
  add column if not exists alternate_phone_normalized text,
  add column if not exists source text not null default 'manual',
  add column if not exists last_imported_at timestamptz;

create unique index if not exists repair_access_customers_phone_normalized_key
  on public.repair_access_customers (phone_normalized)
  where phone_normalized is not null and btrim(phone_normalized) <> '';

create index if not exists repair_access_customers_alternate_phone_normalized_idx
  on public.repair_access_customers (alternate_phone_normalized)
  where alternate_phone_normalized is not null and btrim(alternate_phone_normalized) <> '';

create table if not exists public.repair_access_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'access_excel',
  file_name text not null,
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.repair_access_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.repair_access_import_batches(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_phone text,
  customer_id uuid references public.repair_access_customers(id) on delete set null,
  status text not null check (status in ('imported', 'updated', 'duplicate_ignored', 'error')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists repair_access_import_rows_batch_idx
  on public.repair_access_import_rows (batch_id, row_number);

create index if not exists repair_access_import_rows_phone_idx
  on public.repair_access_import_rows (normalized_phone);

alter table public.repair_access_devices
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.repair_access_orders
  add column if not exists repair_number text,
  add column if not exists technician_id uuid references public.profiles(id) on delete set null,
  add column if not exists work_performed text,
  add column if not exists used_parts text,
  add column if not exists internal_observations text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists budgeted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists repair_started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists warranty_days integer not null default 0,
  add column if not exists warranty_start date,
  add column if not exists warranty_conditions text,
  add column if not exists warranty_active boolean not null default false,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create unique index if not exists repair_access_orders_repair_number_key
  on public.repair_access_orders (repair_number)
  where repair_number is not null and btrim(repair_number) <> '';

create index if not exists repair_access_orders_technician_idx
  on public.repair_access_orders (technician_id);

alter table public.repair_access_orders
  drop constraint if exists repair_access_orders_status_check;

alter table public.repair_access_orders
  add constraint repair_access_orders_status_check
    check (
      status in (
        'ingresado',
        'pendiente_revision',
        'en_revision',
        'presupuestado',
        'esperando_confirmacion_cliente',
        'aprobado_por_cliente',
        'rechazado_por_cliente',
        'en_reparacion',
        'esperando_repuesto',
        'terminado',
        'listo_para_retirar',
        'entregado',
        'cobrado',
        'cancelado',
        'dado_de_baja'
      )
    );

alter table public.repair_access_status_history
  drop constraint if exists repair_access_status_history_next_status_check;

alter table public.repair_access_status_history
  add constraint repair_access_status_history_next_status_check
    check (
      next_status in (
        'ingresado',
        'pendiente_revision',
        'en_revision',
        'presupuestado',
        'esperando_confirmacion_cliente',
        'aprobado_por_cliente',
        'rechazado_por_cliente',
        'en_reparacion',
        'esperando_repuesto',
        'terminado',
        'listo_para_retirar',
        'entregado',
        'cobrado',
        'cancelado',
        'dado_de_baja'
      )
    );

create table if not exists public.repair_access_budgets (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid not null references public.repair_access_orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  work_description text not null,
  required_parts text,
  notes text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'enviado_al_cliente', 'aprobado', 'rechazado', 'vencido')),
  budgeted_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repair_access_budgets_order_idx
  on public.repair_access_budgets (repair_order_id, budgeted_at desc);

alter table public.repair_access_payments
  add column if not exists legacy_repair_payment_id uuid references public.repair_payments(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

create unique index if not exists repair_access_payments_legacy_payment_key
  on public.repair_access_payments (legacy_repair_payment_id)
  where legacy_repair_payment_id is not null;
