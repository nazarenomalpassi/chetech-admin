do $$
begin
  if current_database()<>'chetech_staging' then raise exception 'Isolated staging database required'; end if;
  perform color from public.repair_access_devices limit 1;
end;
$$;

set request.jwt.claim.sub='c5100500-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare
  payload jsonb := jsonb_build_object('customer_name',U&'CHETECH-STAGING-COLOR: Bel\00E9n P\00E9rez','customer_name_normalized','chetech staging color belen perez',
    'customer_phone','3571123456','customer_phone_normalized','3571123456','customer_address','Direccion sintetica',
    'device_type','Televisor','device_brand','STAGING','device_model','COLOR-TEST','serial_number','SERIE-COLOR-TEST',
    'accessory_details','Control y fuente','visual_condition','Rayas en la base','device_color',' Gris ',
    'intake_date','2026-10-07','issue_reported','Prueba aislada de recepcion','priority','normal','status','pendiente_revision');
  result jsonb; r public.repair_access_orders; d public.repair_access_devices; c public.repair_access_customers;
  cash_before jsonb; settings_before jsonb; existing_orders jsonb; old_customer jsonb; old_device jsonb; old_order jsonb; read_result jsonb;
begin
  select jsonb_agg(to_jsonb(m) order by id) into cash_before from public.movimientos_caja m;
  select jsonb_agg(to_jsonb(s) order by key) into settings_before from public.app_settings s;
  select jsonb_agg(to_jsonb(o) order by id) into existing_orders from public.repair_access_orders o;
  result := public.save_repair_access_intake(payload);
  select * into r from public.repair_access_orders where id=(result->>'id')::uuid;
  select * into d from public.repair_access_devices where id=r.device_id;
  select * into c from public.repair_access_customers where id=r.customer_id;
  if d.color is distinct from 'Gris' or d.serial_number<>'SERIE-COLOR-TEST' or d.accessory_details<>'Control y fuente'
    or d.visual_condition<>'Rayas en la base' or c.address<>'Direccion sintetica' then raise exception 'Incomplete reception data'; end if;
  if r.repair_number !~ '^REP-[0-9]+$' then raise exception 'Order number missing'; end if;
  if r.is_paid or r.picked_up_at is not null or r.warranty_start is not null then raise exception 'Intake changed cash/custody/warranty'; end if;
  if exists(select 1 from public.repairs where repair_access_order_id=r.id) or exists(select 1 from public.repair_access_payments where repair_order_id=r.id) then raise exception 'Intake created financial records'; end if;

  payload := payload || jsonb_build_object('id',r.id,'customer_id',r.customer_id,'device_id',r.device_id);
  perform public.save_repair_access_intake(payload - 'device_color');
  if (select color from public.repair_access_devices where id=d.id) is distinct from 'Gris' then raise exception 'Older client cleared color'; end if;
  if (select repair_number from public.repair_access_orders where id=r.id) is distinct from r.repair_number then raise exception 'Edit renumbered order'; end if;
  perform public.save_repair_access_intake(payload || jsonb_build_object('device_color',''));
  if (select color from public.repair_access_devices where id=d.id) is distinct from '' then raise exception 'Explicit color clear failed'; end if;

  select to_jsonb(x) into old_customer from public.repair_access_customers x where id=c.id;
  select to_jsonb(x) into old_device from public.repair_access_devices x where id=d.id;
  select to_jsonb(x) into old_order from public.repair_access_orders x where id=r.id;
  begin
    perform public.save_repair_access_intake(payload || jsonb_build_object('customer_name','Bad change must roll back','device_color',repeat('x',81)));
    raise exception 'Oversized color accepted';
  exception when check_violation then null;
  end;
  if (select to_jsonb(x) from public.repair_access_customers x where id=c.id) is distinct from old_customer
    or (select to_jsonb(x) from public.repair_access_devices x where id=d.id) is distinct from old_device
    or (select to_jsonb(x) from public.repair_access_orders x where id=r.id) is distinct from old_order then raise exception 'Invalid color caused partial writes'; end if;

  read_result := public.workshop_read_page(p_search=>'belen   perez',p_scope=>'all',p_limit=>30);
  if not exists(select 1 from jsonb_array_elements(read_result->'orders') o where o->>'id'=r.id::text) then raise exception 'Accent and whitespace search failed'; end if;
  read_result := public.workshop_read_page(p_search=>replace(r.repair_number,'-',' '),p_scope=>'all',p_limit=>30);
  if not exists(select 1 from jsonb_array_elements(read_result->'orders') o where o->>'id'=r.id::text) then raise exception 'Normalized REP search failed'; end if;

  if (select jsonb_agg(to_jsonb(m) order by id) from public.movimientos_caja m) is distinct from cash_before
    or (select jsonb_agg(to_jsonb(s) order by key) from public.app_settings s) is distinct from settings_before
    or (select jsonb_agg(to_jsonb(o) order by id) from public.repair_access_orders o where id<>r.id) is distinct from existing_orders then raise exception 'Existing operational history changed'; end if;

  perform set_config('chetech.color_fixture_payload',payload::text,true);
  perform set_config('chetech.color_fixture_snapshot',jsonb_build_object('customer',old_customer,'device',old_device,'order',old_order)::text,true);
end;
$$;

set request.jwt.claim.sub='c5100500-0000-4000-8000-000000000002';
do $$
begin
  begin
    perform public.save_repair_access_intake((current_setting('chetech.color_fixture_payload'))::jsonb);
    raise exception 'Technician modified reception data';
  exception when insufficient_privilege or no_data_found then null;
  end;
end;
$$;
reset role;
do $$
declare payload jsonb := current_setting('chetech.color_fixture_payload')::jsonb; snapshot jsonb := current_setting('chetech.color_fixture_snapshot')::jsonb;
begin
  if has_function_privilege('anon','public.save_repair_access_intake(jsonb)','execute') then raise exception 'Anonymous intake access'; end if;
  if (select to_jsonb(c) from public.repair_access_customers c where id=(payload->>'customer_id')::uuid) is distinct from snapshot->'customer'
    or (select to_jsonb(d) from public.repair_access_devices d where id=(payload->>'device_id')::uuid) is distinct from snapshot->'device'
    or (select to_jsonb(o) from public.repair_access_orders o where id=(payload->>'id')::uuid) is distinct from snapshot->'order' then raise exception 'Unauthorized intake changed data'; end if;
end;
$$;
