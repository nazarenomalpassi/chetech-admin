create table if not exists public.balance_transfers (
  id uuid primary key default gen_random_uuid(),
  from_payment_method text not null
    check (from_payment_method in ('efectivo', 'nx_santi', 'nx_local')),
  to_payment_method text not null
    check (to_payment_method in ('efectivo', 'nx_santi', 'nx_local')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  transfer_date date not null default current_date,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  reversal_transfer_id uuid references public.balance_transfers(id) on delete restrict,
  reversal_of_transfer_id uuid references public.balance_transfers(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint balance_transfers_distinct_methods_check
    check (from_payment_method <> to_payment_method)
);

create index if not exists balance_transfers_transfer_date_idx
  on public.balance_transfers (transfer_date desc, created_at desc);

create index if not exists balance_transfers_from_payment_method_idx
  on public.balance_transfers (from_payment_method);

create index if not exists balance_transfers_to_payment_method_idx
  on public.balance_transfers (to_payment_method);

create index if not exists balance_transfers_created_by_idx
  on public.balance_transfers (created_by);

create index if not exists balance_transfers_voided_by_idx
  on public.balance_transfers (voided_by);

create index if not exists balance_transfers_reversal_transfer_idx
  on public.balance_transfers (reversal_transfer_id);

create index if not exists balance_transfers_reversal_of_transfer_idx
  on public.balance_transfers (reversal_of_transfer_id);

alter table public.balance_transfers enable row level security;

drop policy if exists balance_transfers_authenticated_manage on public.balance_transfers;
create policy balance_transfers_authenticated_manage
  on public.balance_transfers
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create or replace function public.void_balance_transfer(
  p_transfer_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  original public.balance_transfers%rowtype;
  reversal_id uuid;
begin
  select *
    into original
    from public.balance_transfers
    where id = p_transfer_id
    for update;

  if not found then
    raise exception 'No se encontro el cambio de balance.';
  end if;

  if original.is_voided then
    raise exception 'Ese cambio de balance ya fue anulado.';
  end if;

  if original.reversal_of_transfer_id is not null then
    raise exception 'No se puede anular un movimiento inverso.';
  end if;

  insert into public.balance_transfers (
    from_payment_method,
    to_payment_method,
    amount,
    description,
    transfer_date,
    created_by,
    reversal_of_transfer_id
  ) values (
    original.to_payment_method,
    original.from_payment_method,
    original.amount,
    coalesce('Anulacion de cambio de balance: ' || nullif(original.description, ''), 'Anulacion de cambio de balance'),
    current_date,
    auth.uid(),
    original.id
  )
  returning id into reversal_id;

  update public.balance_transfers
     set is_voided = true,
         voided_at = now(),
         voided_by = auth.uid(),
         void_reason = nullif(trim(coalesce(p_reason, '')), ''),
         reversal_transfer_id = reversal_id,
         updated_at = now()
   where id = original.id;

  return reversal_id;
end;
$$;

grant execute on function public.void_balance_transfer(uuid, text) to authenticated;
