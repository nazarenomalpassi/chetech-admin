alter table public.tv_boards
add column if not exists released_at timestamptz null;
