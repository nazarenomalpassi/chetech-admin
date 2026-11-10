\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
do $$ begin
  if current_database()<>'chetech_staging' then raise exception 'Isolated local staging only'; end if;
end $$;
create temporary table plan_fixture(key text primary key,id uuid default gen_random_uuid());
insert into plan_fixture(key) values('admin'),('tech'),('customer'),('device'),('order'),('part'),('part_op'),('claim_op'),('close_op');
grant select on plan_fixture to authenticated;
create function pg_temp.f(k text) returns uuid language sql stable as $$ select id from pg_temp.plan_fixture where key=k $$;
create function pg_temp.check_it(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception '%',msg; end if; end $$;
create function pg_temp.actor(k text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub',pg_temp.f(k)::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.f(k),'role','authenticated')::text,true);
end $$;
insert into auth.users(id,email) select id,key||id||'@plan.invalid' from plan_fixture where key in ('admin','tech');
insert into public.profiles(id,role,full_name) select id,case when key='admin' then 'admin' else 'tecnico' end,'Plan test' from plan_fixture where key in ('admin','tech');
select pg_temp.actor('admin');
insert into public.repair_access_customers(id,full_name,phone) values(pg_temp.f('customer'),'Plan synthetic','3510000000');
insert into public.repair_access_devices(id,customer_id,device_type) values(pg_temp.f('device'),pg_temp.f('customer'),'TV');
insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,status,budget_amount,budget_detail)
values(pg_temp.f('order'),pg_temp.f('customer'),pg_temp.f('device'),'Sin imagen','presupuestado',100,'Fuente');
select public.workshop_decide(pg_temp.f('order'),(select workflow_version from public.repair_access_orders where id=pg_temp.f('order')),gen_random_uuid(),'accepted','presencial','Prueba sintetica');
insert into public.repair_part_requests(id,operation_id,order_id,description,quantity,received_quantity,status,requested_by,supplier,unit_cost)
values(pg_temp.f('part'),pg_temp.f('part_op'),pg_temp.f('order'),'Fuente sintetica',2,1,'ordered',pg_temp.f('admin'),'Proveedor privado',8500.50);
create temporary table preserved_plan as select to_jsonb(o) original from public.repair_access_orders o where id=pg_temp.f('order');
create temporary table claim_result(data jsonb);
grant select,insert on claim_result to authenticated;
set local role authenticated;
insert into claim_result select public.workshop_save_supplier_claim(pg_temp.f('claim_op'),pg_temp.f('part'),1,null,'{"reason":"Fuente con falla","quantity":1,"extra_cost":null}');
select pg_temp.check_it((public.workshop_save_supplier_claim(pg_temp.f('claim_op'),pg_temp.f('part'),1,null,'{"reason":"Fuente con falla","quantity":1,"extra_cost":null}')->>'replayed')::boolean,'Replay failed');
do $$ begin
  begin perform public.workshop_save_supplier_claim(pg_temp.f('claim_op'),pg_temp.f('part'),1,null,'{"reason":"Otra falla","quantity":1}'); raise exception 'Changed replay accepted'; exception when check_violation then null; end;
  begin perform public.workshop_save_supplier_claim(gen_random_uuid(),pg_temp.f('part'),2,null,'{"reason":"Duplicado","quantity":1}'); raise exception 'Overclaim accepted'; exception when check_violation then null; end;
  begin perform public.workshop_save_supplier_claim(gen_random_uuid(),pg_temp.f('part'),99,null,'{"reason":"Stale","quantity":1}'); raise exception 'Stale version accepted'; exception when serialization_failure then null; end;
  begin perform public.workshop_manage_part(pg_temp.f('part'),2,'install',1,null,null,null,''); raise exception 'Claimed part installed'; exception when check_violation then
    if sqlerrm not like 'Este repuesto tiene un reclamo%' then raise; end if;
  end;
  begin perform public.workshop_save_supplier_claim(gen_random_uuid(),pg_temp.f('part'),1,(select (data->>'id')::uuid from claim_result),'{"status":"resolved","resolution":"","extra_cost":null}'); raise exception 'Closed without resolution'; exception when check_violation then null; end;
end $$;
select pg_temp.check_it((public.get_workshop_parts_page(1,'Fuente sintetica','all')->'total')::integer=1,'Queue filter incorrect');
select pg_temp.check_it((public.get_workshop_parts_page(1,'Fuente sintetica','available')->'total')::integer=0,'Claimed stock appears available');
select pg_temp.check_it((select extra_cost is null from public.repair_supplier_claims where id=(select (data->>'id')::uuid from claim_result)),'Unknown cost became zero');
select pg_temp.check_it((public.get_workshop_parts_page(1,'Fuente sintetica','all')->'items'->0->>'unitCost')::numeric=8500.50,'Admin cost missing');
select pg_temp.actor('tech');
select pg_temp.check_it((public.get_workshop_parts_page(1,'Fuente sintetica','all')->'items'->0->>'unitCost') is null,'Tech cost leaked');
select pg_temp.check_it((public.get_workshop_parts_page(1,'Fuente sintetica','all')->'items'->0->>'supplier') is null,'Tech supplier leaked');
do $$ begin
  begin perform public.get_workshop_supplier_claims(false,1); raise exception 'Tech read supplier claims'; exception when insufficient_privilege then null; end;
  begin perform public.workshop_save_supplier_claim(gen_random_uuid(),pg_temp.f('part'),1,null,'{"reason":"Tech claim","quantity":1}'); raise exception 'Tech wrote supplier claim'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.actor('admin');
select public.workshop_save_supplier_claim(pg_temp.f('close_op'),pg_temp.f('part'),1,(select (data->>'id')::uuid from claim_result),'{"status":"resolved","resolution":"Reemplazo recibido, verificar antes de usar","extra_cost":0}');
select pg_temp.check_it((public.get_workshop_supplier_claims(true,1)->'total')::integer>=1,'Closed history missing');
reset role;
select pg_temp.check_it((select to_jsonb(o) from public.repair_access_orders o where id=pg_temp.f('order'))=(select original from preserved_plan),'Original order or money changed');
select pg_temp.check_it((select installed_quantity=0 and received_quantity=1 and unit_cost=8500.50 from public.repair_part_requests where id=pg_temp.f('part')),'Claim moved stock or cost');
select pg_temp.check_it(not has_function_privilege('anon','public.workshop_save_supplier_claim(uuid,uuid,integer,uuid,jsonb)','execute'),'Anon can write');
select pg_temp.check_it(not has_table_privilege('authenticated','public.repair_supplier_claims','insert'),'Direct insert exposed');
select 'PASS: supplier claims, replay, concurrency, privacy, partial queue and financial preservation' result;
rollback;
