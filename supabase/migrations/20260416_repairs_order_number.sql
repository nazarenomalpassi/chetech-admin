alter table public.repairs
add column if not exists order_number text;

create index if not exists repairs_order_number_idx
on public.repairs(order_number);

