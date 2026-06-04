create table if not exists public.installment_sales (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  customer_name text not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  installments_count integer not null check (installments_count > 0),
  notes text,
  status text not null default 'activa' check (status in ('activa', 'finalizada', 'cancelada')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  installment_sale_id uuid not null references public.installment_sales(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('efectivo', 'nx', 'mp')),
  status text not null default 'pendiente' check (status in ('pendiente', 'pagada', 'vencida', 'cancelada')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installment_sale_id, installment_number)
);

create index if not exists installment_sales_customer_name_idx on public.installment_sales (customer_name);
create index if not exists installment_sales_product_name_idx on public.installment_sales (product_name);
create index if not exists installments_due_date_idx on public.installments (due_date);
create index if not exists installments_status_idx on public.installments (status);
create index if not exists installments_payment_method_idx on public.installments (payment_method);
