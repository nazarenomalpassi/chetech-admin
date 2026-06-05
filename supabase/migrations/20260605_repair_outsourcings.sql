create table if not exists public.repair_outsourcings (
  id uuid primary key default gen_random_uuid(),
  repair_access_order_id uuid not null references public.repair_access_orders(id) on delete restrict,
  workshop_name text not null,
  sent_at date not null default current_date,
  retrieved_at date,
  status text not null default 'en_taller'
    check (status in ('en_taller', 'retirado', 'cancelado')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_outsourcings_retrieved_at_check
    check (status <> 'retirado' or retrieved_at is not null)
);

create unique index if not exists repair_outsourcings_active_order_key
  on public.repair_outsourcings (repair_access_order_id)
  where status = 'en_taller';

create index if not exists repair_outsourcings_order_idx
  on public.repair_outsourcings (repair_access_order_id);

create index if not exists repair_outsourcings_status_idx
  on public.repair_outsourcings (status);

create index if not exists repair_outsourcings_sent_at_idx
  on public.repair_outsourcings (sent_at desc);

create index if not exists repair_outsourcings_workshop_name_idx
  on public.repair_outsourcings (lower(workshop_name));

alter table public.repair_outsourcings enable row level security;

drop policy if exists repair_outsourcings_authenticated_manage on public.repair_outsourcings;
create policy repair_outsourcings_authenticated_manage
  on public.repair_outsourcings
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
