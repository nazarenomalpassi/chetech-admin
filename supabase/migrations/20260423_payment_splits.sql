do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'movimientos_caja_medio_pago_check'
      and conrelid = 'public.movimientos_caja'::regclass
  ) then
    alter table public.movimientos_caja drop constraint movimientos_caja_medio_pago_check;
  end if;
end $$;

alter table public.movimientos_caja
add constraint movimientos_caja_medio_pago_check
check (medio_pago in ('efectivo', 'nx', 'mp', 'transferencia', 'otro'));
