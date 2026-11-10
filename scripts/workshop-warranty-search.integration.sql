\set ON_ERROR_STOP on
begin;
do $$ begin if current_database()<>'chetech_staging' then raise exception 'Isolated staging required'; end if; end $$;
create temporary table warranty_search_fixture(key text primary key,id uuid default gen_random_uuid());
insert into warranty_search_fixture(key) values('admin'),('tech'),('customer'),('device'),('order'),('return');
grant select on warranty_search_fixture to authenticated;
create function pg_temp.f(k text) returns uuid language sql stable as $$ select id from pg_temp.warranty_search_fixture where key=k $$;
create function pg_temp.check_it(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception '%',msg; end if; end $$;
insert into auth.users(id,email) select id,id||'@warranty-search.invalid' from warranty_search_fixture where key in ('admin','tech');
insert into public.profiles(id,role,full_name) select id,case when key='admin' then 'admin' else 'tecnico' end,'Search test' from warranty_search_fixture where key in ('admin','tech');
select set_config('request.jwt.claim.sub',pg_temp.f('admin')::text,true);
insert into public.repair_access_customers(id,full_name,phone,dni) values(pg_temp.f('customer'),U&'Bel\00e9n de prueba','3510000000','9994177319');
insert into public.repair_access_devices(id,customer_id,device_type) values(pg_temp.f('device'),pg_temp.f('customer'),'TV');
insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,status)
values(pg_temp.f('order'),pg_temp.f('customer'),pg_temp.f('device'),'Falla original diferente','no_presenta_fallas');
select public.workshop_deliver(pg_temp.f('order'),(select workflow_version from public.repair_access_orders where id=pg_temp.f('order')),'Cliente sintetico','Accesorios devueltos',false);
insert into public.repair_warranty_returns(id,order_id,received_on,issue_reported,status,progress,original_delivery_at,created_by,updated_by)
values(pg_temp.f('return'),pg_temp.f('order'),current_date,'Retro intermitente en garantia','en_revision','Verificar al calentar',now(),pg_temp.f('admin'),pg_temp.f('admin'));
create temporary table warranty_search_preserved as select to_jsonb(o) original from public.repair_access_orders o where id=pg_temp.f('order');
set local role authenticated;
select pg_temp.check_it((public.workshop_read_page('retro intermitente','en_revision')->>'total')::integer=1,'Active return missing from state/fault query');
select pg_temp.check_it((public.workshop_read_page('verificar al calentar','todos')->>'total')::integer=1,'Warranty progress missing from search');
select pg_temp.check_it((public.workshop_read_page('belen de prueba','en_revision')->>'total')::integer=1,'Accent normalization differs');
select pg_temp.check_it((public.workshop_read_page('belen de prueba','retirado')->>'total')::integer=0,'Original retired status incorrectly matches active return');
select pg_temp.check_it((public.workshop_read_page('belen de prueba','en_revision','pending_delivery')->>'total')::integer=1,'Re-entry is not visible in custody');
select pg_temp.check_it((public.workshop_read_page('9994177319','todos')->>'total')::integer=1,'Admin DNI search missing');
select set_config('request.jwt.claim.sub',pg_temp.f('tech')::text,true);
select pg_temp.check_it((public.workshop_read_page('9994177319','todos')->>'total')::integer=0,'Private DNI inferred through technician search');
select pg_temp.check_it((public.workshop_read_page('retro intermitente','en_revision')->>'total')::integer=1,'Technician cannot find active return');
reset role;
select pg_temp.check_it((select to_jsonb(o) from public.repair_access_orders o where id=pg_temp.f('order'))=(select original from warranty_search_preserved),'Search mutated original order');
select 'PASS: active return fault, status, progress, accents and custody; original order preserved' result;
rollback;
