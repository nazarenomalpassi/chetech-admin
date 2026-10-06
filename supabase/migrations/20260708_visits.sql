create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  visit_date date not null,
  time_from time not null,
  time_to time not null,
  reason text not null,
  notes text,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'en_camino', 'realizada', 'cancelada')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visits_visit_date_idx on public.visits (visit_date asc, time_from asc);
create index if not exists visits_status_idx on public.visits (status);
create index if not exists visits_customer_name_idx on public.visits (lower(customer_name));
create index if not exists visits_customer_phone_idx on public.visits (customer_phone);

create or replace function public.set_visits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_visits_updated_at on public.visits;

create trigger trg_visits_updated_at
before update on public.visits
for each row
execute function public.set_visits_updated_at();

alter table public.visits enable row level security;
revoke all on table public.visits from anon;
grant select, insert, update, delete on table public.visits to authenticated;
grant select, insert, update, delete on table public.visits to service_role;

drop policy if exists visits_authenticated_manage on public.visits;
create policy visits_authenticated_manage
  on public.visits
  for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');
