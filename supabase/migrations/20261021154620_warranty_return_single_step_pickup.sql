begin;
-- Supabase production migration version assigned on 2026-10-21.
set local lock_timeout='5s';

-- Preserve the existing RPC signature, ACLs, locks, receipts and immutable original order.
-- A completed resolution submitted now is enough to register pickup in the same transaction.
do $patch$
declare definition text;
  old_guard text:=$guard$if p_status='retirado' and (w.status not in ('listo_para_retirar','no_presenta_fallas','sin_solucion') or length(trim(coalesce(p_recipient,'')))<2) then$guard$;
  new_guard text:=$guard$if p_status='retirado' and (
    length(trim(coalesce(p_recipient,'')))<2
    or (w.status not in ('listo_para_retirar','no_presenta_fallas','sin_solucion')
      and length(trim(coalesce(nullif(trim(p_resolution),''),w.resolution,'')))<3)
  ) then$guard$;
begin
  definition:=pg_get_functiondef('private.workshop_warranty_save(uuid,integer,uuid,text,text,text,text)'::regprocedure);
  if position(old_guard in definition)=0 then raise exception 'Unexpected warranty return pickup guard; no changes applied.'; end if;
  definition:=replace(definition,old_guard,new_guard);
  definition:=replace(definition,'Guarda primero el resultado de la revision y luego indica quien retira.',
    'Indica quien retira y completa la resolucion del reingreso para registrar la devolucion en un solo paso.');
  execute definition;
end $patch$;

notify pgrst,'reload schema';
commit;
