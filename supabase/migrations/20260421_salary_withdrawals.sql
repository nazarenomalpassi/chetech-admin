create table if not exists public.salary_withdrawals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('efectivo', 'nx', 'mp')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists salary_withdrawals_date_idx on public.salary_withdrawals(withdrawal_date desc);
create index if not exists salary_withdrawals_payment_method_idx on public.salary_withdrawals(payment_method);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'movimientos_caja_tipo_check'
      and conrelid = 'public.movimientos_caja'::regclass
  ) then
    alter table public.movimientos_caja drop constraint movimientos_caja_tipo_check;
  end if;
end $$;

alter table public.movimientos_caja
add constraint movimientos_caja_tipo_check
check (tipo in ('venta', 'reparacion', 'gasto', 'facturacion', 'sueldo'));
