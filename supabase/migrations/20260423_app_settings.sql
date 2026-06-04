create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values (
  'cash_runtime',
  jsonb_build_object(
    'openingBalances',
    jsonb_build_object(
      'efectivo', 193573,
      'nx', 60344,
      'mp', 10000
    ),
    'movementCutoff',
    '2026-04-16T14:21:01.222Z'
  )
)
on conflict (key) do nothing;
