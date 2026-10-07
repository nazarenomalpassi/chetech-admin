-- Existing reception data is retained; legacy color remains in visual_condition.
alter table public.repair_access_devices add column if not exists color text;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.repair_access_devices'::regclass and conname='repair_access_devices_color_length') then
    alter table public.repair_access_devices add constraint repair_access_devices_color_length check(char_length(color)<=80);
  end if;
end;
$$;

-- Extend the existing invoker RPC without changing numbering, roles or its contract.
do $$
declare
  definition text := replace(pg_get_functiondef('public.save_repair_access_intake(jsonb)'::regprocedure),E'\r\n',E'\n');
  anchors text[] := array[
    $old$      visual_condition,
      created_by,$old$,
    $old$      nullif(p_payload->>'visual_condition', ''),
      v_user_id,$old$,
    $old$      visual_condition = nullif(p_payload->>'visual_condition', ''),$old$
  ];
  replacements text[] := array[
    $new$      visual_condition,
      color,
      created_by,$new$,
    $new$      nullif(p_payload->>'visual_condition', ''),
      case when p_payload ? 'device_color' then btrim(p_payload->>'device_color') else null end,
      v_user_id,$new$,
    $new$      visual_condition = nullif(p_payload->>'visual_condition', ''),
      color = case when p_payload ? 'device_color' then btrim(p_payload->>'device_color') else color end,$new$
  ];
  index integer;
begin
  if strpos(definition,replacements[3])>0 then return; end if;
  for index in 1..3 loop
    if length(definition)-length(replace(definition,anchors[index],''))<>length(anchors[index]) then
      raise exception 'Unexpected intake definition at anchor %. Review migration before applying.',index;
    end if;
    definition := replace(definition,anchors[index],replacements[index]);
  end loop;
  execute definition;
end;
$$;

do $migration$
declare extension_schema text;
begin
  select n.nspname into extension_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='unaccent';
  if extension_schema is null then raise exception 'The existing unaccent extension is required.'; end if;
  execute format($definition$
    create or replace function private.workshop_search_text(value text)
    returns text language sql stable set search_path='' as $body$
      select btrim(lower(regexp_replace(regexp_replace(%I.unaccent(coalesce(value,'')),'[^a-zA-Z0-9 ]+',' ','g'),' +',' ','g')))
    $body$
  $definition$,extension_schema);
end;
$migration$;
revoke all on function private.workshop_search_text(text) from public,anon;
grant execute on function private.workshop_search_text(text) to authenticated,service_role;

-- The filter corpus and financial projections remain unchanged.
do $$
declare
  definition text := pg_get_functiondef('private.workshop_read_page(text,text,text,text,timestamp with time zone,uuid,integer)'::regprocedure);
  anchor text := $old$position(lower(left(trim(p_search),200)) in lower(concat_ws(' ',o.repair_number,o.legacy_order_number,c.full_name,c.phone,c.alternate_phone,d.device_type,d.brand,d.model,d.serial_number,o.issue_reported,o.technical_diagnosis,o.budget_detail,o.status)))>0$old$;
  replacement text := $new$position(private.workshop_search_text(left(p_search,200)) in private.workshop_search_text(concat_ws(' ',o.repair_number,o.legacy_order_number,c.full_name,c.phone,c.alternate_phone,d.device_type,d.brand,d.model,d.serial_number,o.issue_reported,o.technical_diagnosis,o.budget_detail,o.status)))>0$new$;
begin
  if strpos(definition,replacement)>0 then return; end if;
  if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then
    raise exception 'Unexpected workshop search definition. Review migration before applying.';
  end if;
  execute replace(definition,anchor,replacement);
end;
$$;
notify pgrst,'reload schema';
