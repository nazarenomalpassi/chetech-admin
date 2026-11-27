-- Auditoría del 27/11/2026: el rol anónimo (sin sesión) tenía todos los permisos sobre tablas
-- internas creadas después de la última revisión (los permisos por defecto de Supabase los dan
-- solos). RLS ya bloqueaba las filas, pero TRUNCATE no pasa por RLS: se quitan igual.
-- Solo permisos, sin datos. Idempotente.
do $$
declare
  t text;
begin
  foreach t in array array[
    'financial_reserves', 'repair_budget_versions', 'repair_customer_decisions',
    'repair_order_attachments', 'repair_part_requests', 'replenishment_plan_items',
    'salary_liquidation_funding', 'salary_liquidation_members', 'salary_liquidations',
    'salary_members', 'workshop_events', 'workshop_tasks'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
  -- Las familias de la tienda son de lectura pública (política storefront_families_public_read).
  if to_regclass('public.storefront_families') is not null then
    revoke insert, update, delete, truncate on table public.storefront_families from anon;
  end if;
  -- La tienda lee la configuración pública (por ejemplo, la promoción) sin sesión. La política
  -- storefront_settings_public_read ya limita a las filas con is_public, pero faltaba el permiso.
  if to_regclass('public.storefront_settings') is not null then
    grant select on table public.storefront_settings to anon;
  end if;
end $$;
