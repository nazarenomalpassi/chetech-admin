alter table public.repair_payments
add column if not exists created_at timestamptz;

update public.repair_payments
set created_at = payment_date::timestamptz
where created_at is null;

alter table public.repair_payments
alter column created_at set default now();

