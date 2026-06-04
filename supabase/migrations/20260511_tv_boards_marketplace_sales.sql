alter table public.tv_boards
add column if not exists sold_at timestamptz null,
add column if not exists mercado_libre_net_amount numeric(12,2) null,
add column if not exists release_date date null,
add column if not exists sale_notes text null;

create index if not exists tv_boards_sold_at_idx on public.tv_boards (sold_at);
create index if not exists tv_boards_release_date_idx on public.tv_boards (release_date);
