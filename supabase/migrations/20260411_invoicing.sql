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
