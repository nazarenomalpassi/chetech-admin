create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_nombre_idx on public.clientes(nombre);
create index if not exists clientes_telefono_idx on public.clientes(telefono);

alter table public.sales
add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

alter table public.repairs
add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

alter table public.repairs
add column if not exists order_number text;

create index if not exists repairs_order_number_idx on public.repairs(order_number);

alter table public.repair_payments
add column if not exists created_at timestamptz;

update public.repair_payments
set created_at = payment_date::timestamptz
where created_at is null;

alter table public.repair_payments
alter column created_at set default now();

create table if not exists public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('venta', 'reparacion', 'gasto', 'facturacion')),
  monto numeric(12,2) not null check (monto >= 0),
  medio_pago text not null check (medio_pago in ('efectivo', 'mp', 'nx')),
  descripcion text,
  referencia_tabla text,
  referencia_id uuid,
  fecha timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_caja_fecha_idx on public.movimientos_caja(fecha);
create index if not exists movimientos_caja_tipo_idx on public.movimientos_caja(tipo);
create index if not exists movimientos_caja_medio_pago_idx on public.movimientos_caja(medio_pago);
create index if not exists movimientos_caja_referencia_idx on public.movimientos_caja(referencia_tabla, referencia_id);

create table if not exists public.cierres_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  saldo_inicial numeric(12,2) not null default 0,
  ingresos numeric(12,2) not null default 0,
  egresos numeric(12,2) not null default 0,
  saldo_final numeric(12,2) not null default 0,
  observaciones text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.products(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida')),
  cantidad integer not null check (cantidad > 0),
  descripcion text,
  referencia_tabla text,
  referencia_id uuid,
  fecha timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists movimientos_stock_producto_idx on public.movimientos_stock(producto_id);
create index if not exists movimientos_stock_fecha_idx on public.movimientos_stock(fecha);

create or replace function public.resumen_caja_diario(p_fecha date default current_date)
returns table (
  ingresos numeric,
  egresos numeric,
  ganancia_real numeric
)
language sql
stable
as $$
  select
    coalesce(sum(case when tipo in ('venta', 'reparacion', 'facturacion') then monto else 0 end), 0)::numeric as ingresos,
    coalesce(sum(case when tipo = 'gasto' then monto else 0 end), 0)::numeric as egresos,
    (
      coalesce(sum(case when tipo in ('venta', 'reparacion', 'facturacion') then monto else 0 end), 0) -
      coalesce(sum(case when tipo = 'gasto' then monto else 0 end), 0)
    )::numeric as ganancia_real
  from public.movimientos_caja
  where fecha::date = p_fecha;
$$;

