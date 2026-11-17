-- El asesor de Supabase marca dos índices idénticos en repair_access_orders:
-- repair_access_orders_created_at_id_idx (20260731) y workshop_orders_creation_idx (20261005),
-- ambos sobre (created_at desc, id desc). Se conserva el primero.
drop index if exists public.workshop_orders_creation_idx;
