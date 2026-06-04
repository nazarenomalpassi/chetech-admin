create table if not exists public.tv_boards (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  board_type text not null check (board_type in ('fuente', 'main', 'tcom')),
  listed_price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tv_boards_brand_idx on public.tv_boards (lower(brand));
create index if not exists tv_boards_model_idx on public.tv_boards (lower(model));
create index if not exists tv_boards_type_idx on public.tv_boards (board_type);
create index if not exists tv_boards_active_idx on public.tv_boards (is_active);

create or replace function public.set_tv_boards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tv_boards_updated_at on public.tv_boards;

create trigger trg_tv_boards_updated_at
before update on public.tv_boards
for each row
execute function public.set_tv_boards_updated_at();
