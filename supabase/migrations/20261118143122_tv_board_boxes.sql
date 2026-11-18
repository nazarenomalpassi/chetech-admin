-- Organizador de placas de televisores: cajas numeradas y la caja de cada placa.
-- Aditiva: tabla nueva, columna opcional en tv_boards y una función para crear cajas con el
-- número siguiente. No modifica datos existentes ni las guardas de venta y liberación.
begin;

create table if not exists public.tv_board_boxes (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  label text check (label is null or char_length(label) <= 80),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tv_board_boxes enable row level security;

drop policy if exists tv_board_boxes_admin_all on public.tv_board_boxes;
create policy tv_board_boxes_admin_all on public.tv_board_boxes
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.tv_board_boxes from anon, public;
grant select, insert, update, delete on public.tv_board_boxes to authenticated;
grant all on public.tv_board_boxes to service_role;

alter table public.tv_boards
  add column if not exists box_id uuid references public.tv_board_boxes(id) on delete set null;

create index if not exists tv_boards_box_id_idx on public.tv_boards (box_id);

-- Crea una caja con el número que sigue. El bloqueo evita dos cajas con el mismo número
-- si se crean a la vez desde dos dispositivos.
create or replace function public.create_tv_board_box(p_label text default null)
returns table (id uuid, number integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_number integer;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if auth.uid() is null or (select private.is_admin()) is not true then
    raise exception 'Solo la administración puede crear cajas.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.tv_board_boxes.number'));
  select coalesce(max(b.number), 0) + 1 into v_number from public.tv_board_boxes b;

  return query
    insert into public.tv_board_boxes (number, label)
    values (v_number, v_label)
    returning tv_board_boxes.id, tv_board_boxes.number;
end;
$$;

revoke all on function public.create_tv_board_box(text) from public, anon;
grant execute on function public.create_tv_board_box(text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
