\set ON_ERROR_STOP on
-- Local-only regression plan: scoped fixtures -> replay/task/QC/parts guards -> rollback.
-- Get-Content -Raw scripts/workshop-integration.sql | docker exec -i
-- chetech-staging-20261005 psql -U postgres -d chetech_staging -X -f -
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$ begin
  if current_database()<>'chetech_staging' then raise exception 'Local staging database required'; end if;
end $$;
create temporary table workshop_fixture(key text primary key,id uuid not null default gen_random_uuid());
insert into workshop_fixture(key) values
 ('admin'),('admin_other'),('tech'),('customer'),('device'),('product'),
 ('order_smoke'),('order_replay'),('order_revoke'),('order_quality'),('order_ready'),
 ('order_install'),('order_legacy'),('order_modern'),('order_receipt_legacy'),('order_history'),('decision_op'),('receipt_legacy_op'),
 ('tech_other'),('tech_deleted'),('employee'),('order_context'),('order_assignment'),('order_foreign'),('order_delivery'),('order_legacy_delivery'),
 ('order_claim'),('order_claim_admin'),('order_claim_guard'),('order_quote_qc'),('order_technical_save'),
 ('order_security'),('order_security_rpc'),('order_rls_security'),('order_final_price'),('order_no_consent'),
 ('order_free'),('order_part_replay'),('order_part_legacy'),('part_legacy_op'),
 ('order_legacy_accepted_quote'),('order_legacy_work_quote'),('order_legacy_tests_quote');
create temporary table workshop_failures(case_name text,message text);
grant select on workshop_fixture to authenticated;
grant select,insert on workshop_failures to authenticated;
create function pg_temp.fixture(p_key text) returns uuid language sql stable as $$
  select id from pg_temp.workshop_fixture where key=p_key
$$;
create function pg_temp.check_that(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception '%',p_message; end if; end $$;
create function pg_temp.actor(p_key text) returns void language plpgsql as $$
declare v_id uuid := pg_temp.fixture(p_key);
begin
  perform set_config('request.jwt.claim.sub',v_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_id,'role','authenticated')::text,true);
end $$;
insert into auth.users(id,email)
select id,key||'-'||id||'@workshop-staging.invalid' from workshop_fixture where key in ('admin','admin_other','tech','tech_other','tech_deleted','employee');
insert into public.profiles(id,full_name,role)
select id,'WS-ROLLBACK '||key,case when key like 'tech%' then 'tecnico' when key='employee' then 'customer' else 'admin' end
from workshop_fixture where key in ('admin','admin_other','tech','tech_other','tech_deleted','employee');
select pg_temp.actor('admin');
insert into public.repair_access_customers(id,full_name,phone)
values(pg_temp.fixture('customer'),'WS-ROLLBACK customer','3510000000');
insert into public.repair_access_devices(id,customer_id,device_type)
values(pg_temp.fixture('device'),pg_temp.fixture('customer'),'Televisor sintetico');
insert into public.products(id,sku,name,stock,cost,sale_price)
values(pg_temp.fixture('product'),'WS-'||pg_temp.fixture('product'),'WS-ROLLBACK fuente',10,10,20);
insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,budget_amount,budget_detail,budgeted_at,status,technician_id,quality_checked_at,quality_checked_by)
select id,pg_temp.fixture('customer'),pg_temp.fixture('device'),'WS-ROLLBACK-'||id,
  case when key in ('order_legacy_accepted_quote','order_legacy_work_quote','order_legacy_tests_quote') then 100 else 100000 end,'Fuente sintetica',now(),
  case when key in ('order_legacy','order_modern','order_legacy_work_quote') then 'en_reparacion'
    when key='order_legacy_accepted_quote' then 'presupuestado_aceptado'
    when key='order_legacy_tests_quote' then 'en_pruebas' else 'presupuestado' end,
  pg_temp.fixture('tech'),case when key in ('order_quality','order_legacy_accepted_quote','order_legacy_work_quote','order_legacy_tests_quote') then '2026-10-01 12:00:00+00'::timestamptz end,
  case when key in ('order_quality','order_legacy_accepted_quote','order_legacy_work_quote','order_legacy_tests_quote') then pg_temp.fixture('admin') end
from workshop_fixture where key like 'order_%';
update public.repair_access_orders set approval_status='pending' where id=pg_temp.fixture('order_modern');
insert into public.repair_budget_versions(order_id,revision,amount,detail,created_by)
values(pg_temp.fixture('order_receipt_legacy'),1,100000,'Historico',pg_temp.fixture('admin'));
-- No request fingerprint column in the original insert: simulate a pre-hardening receipt.
insert into public.repair_customer_decisions(operation_id,order_id,budget_version_id,decision,channel,notes,recorded_by)
select pg_temp.fixture('receipt_legacy_op'),order_id,id,'accepted','telefono','Historico',pg_temp.fixture('admin')
from public.repair_budget_versions where order_id=pg_temp.fixture('order_receipt_legacy') and revision=1;
update public.repair_access_orders set technician_id=null where id in
 (pg_temp.fixture('order_claim'),pg_temp.fixture('order_claim_admin'),pg_temp.fixture('order_claim_guard'));
update public.repair_access_orders set final_amount=100000 where id=pg_temp.fixture('order_final_price');
update public.repair_access_orders set approval_status='pending' where id=pg_temp.fixture('order_no_consent');
update public.repair_access_orders set budget_amount=0,budget_detail=null,has_warranty=true,warranty_days=30 where id=pg_temp.fixture('order_free');
insert into public.repair_part_requests(operation_id,order_id,description,quantity,priority,notes,requested_by)
values(pg_temp.fixture('part_legacy_op'),pg_temp.fixture('order_part_legacy'),'Repuesto historico',1,'normal','Nota historica',pg_temp.fixture('tech'));
-- Local verification may inject the addon migration here before exercising RPCs.
set local role authenticated;

do $$ declare o uuid:=pg_temp.fixture('order_smoke'); v integer; q uuid; page jsonb; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Acepto el monto');
  begin
    perform public.workshop_save(o,v,'{"repair_progress":"dato viejo"}');
    raise exception 'Stale version was accepted';
  exception when serialization_failure then null; end;
  q:=(public.workshop_request_part(o,gen_random_uuid(),'Fuente sintetica',2,'alta','',null)->>'id')::uuid;
  perform public.workshop_manage_part(q,1,'order',0,'Proveedor sintetico',15000,current_date+2,'');
  perform public.workshop_manage_part(q,2,'receive',1,null,null,null,'');
  begin
    perform public.workshop_manage_part(q,3,'receive',2,null,null,null,'');
    raise exception 'Excess receipt was accepted';
  exception when check_violation then null; end;
  perform pg_temp.check_that((select received_quantity=1 from public.repair_part_requests where id=q),'Excess receipt changed fixture');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"budget_amount":120000,"budget_detail":"Fuente y mano de obra"}');
  perform pg_temp.check_that((select approval_status='pending' from public.repair_access_orders where id=o),'Budget edit did not invalidate approval');
  perform pg_temp.check_that((select count(*)=1 from public.repair_customer_decisions where order_id=o),'Fixture decision history changed');
  page:=public.workshop_read_page('WS-ROLLBACK-'||o,'todos','todos','parts',null,null,1);
  perform pg_temp.check_that((page->>'total')::integer=1 and page->'orders'->0->>'id'=o::text,'Scoped search/parts page missing fixture');
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_decide(o,1,gen_random_uuid(),'accepted','telefono','');
    raise exception 'Technician could decide';
  exception when insufficient_privilege then null; end;
  begin
    perform public.workshop_deliver(o,1,'Cliente','saldo autorizado',true);
    raise exception 'Technician could deliver';
  exception when insufficient_privilege then null; end;
  perform pg_temp.check_that((select count(*)=0 from public.repair_part_requests where order_id=o),'Technician can read fixture part costs');
  perform pg_temp.check_that(public.get_workshop_context(array[o])->0->'parts'->0->>'unitCost' is null,'Safe RPC exposed fixture cost');
  perform pg_temp.actor('admin');
  raise notice 'PASS scoped baseline, rollback, history, page and technician permissions';
exception when others then insert into pg_temp.workshop_failures values('baseline',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_replay'); op uuid:=pg_temp.fixture('decision_op'); v integer; saved integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,op,'accepted','telefono','Solicitud original');
  select workflow_version into saved from public.repair_access_orders where id=o;
  perform pg_temp.check_that((public.workshop_decide(o,v,op,'accepted','telefono','Solicitud original')->>'replayed')::boolean,'Exact replay missing');
  begin
    perform public.workshop_decide(o,v,op,'rejected','telefono','Solicitud original');
    raise exception 'Replay accepted a different decision';
  exception when check_violation then null; end;
  begin
    perform public.workshop_decide(o,v,op,'accepted','whatsapp','Solicitud original');
    raise exception 'Replay accepted a different channel';
  exception when check_violation then null; end;
  begin
    perform public.workshop_decide(o,v,op,'accepted','telefono','Notas diferentes');
    raise exception 'Replay accepted different notes';
  exception when check_violation then null; end;
  begin
    perform public.workshop_decide(o,v+1,op,'accepted','telefono','Solicitud original');
    raise exception 'Replay accepted a different request version';
  exception when check_violation then null; end;
  perform pg_temp.actor('admin_other');
  begin
    perform public.workshop_decide(o,v,op,'accepted','telefono','Solicitud original');
    raise exception 'Replay accepted a different actor';
  exception when check_violation then null; end;
  perform pg_temp.actor('admin');
  begin
    perform public.workshop_decide(pg_temp.fixture('order_smoke'),v,op,'accepted','telefono','Solicitud original');
    raise exception 'Replay accepted a different order';
  exception when check_violation then null; end;
  perform pg_temp.check_that((select count(*)=1 from public.repair_customer_decisions where order_id=o),'Replay duplicated decisions');
  perform pg_temp.check_that((select workflow_version=saved from public.repair_access_orders where id=o),'Replay changed order version');
  raise notice 'PASS decision replay fingerprint, actor, order and no-write retry';
exception when others then insert into pg_temp.workshop_failures values('decision replay',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_revoke'); v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'revoked','telefono','Cliente cambia de decision');
  perform pg_temp.check_that((select count(*)=1 from public.workshop_tasks where order_id=o and kind='approval' and resolved_at is null),'Revocation did not reopen approval');
  perform pg_temp.check_that((select count(*)=0 from public.workshop_tasks where order_id=o and kind in ('work','delivery') and resolved_at is null),'Revocation left work/delivery actionable');
  perform pg_temp.check_that((select status='presupuestado' and approval_status='revoked' and approved_amount is null from public.repair_access_orders where id=o),'Revocation retained approval');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','presencial','Nueva autorizacion');
  perform pg_temp.check_that((select count(*)=1 from public.workshop_tasks where order_id=o and kind='work' and resolved_at is null),'Reapproval did not reopen work');
  perform pg_temp.check_that((select count(*)=0 from public.workshop_tasks where order_id=o and kind in ('approval','delivery') and resolved_at is null),'Reapproval left obsolete tasks');
  raise notice 'PASS revocation and reapproval task lifecycle';
exception when others then insert into pg_temp.workshop_failures values('revocation tasks',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_quality'); v integer; before_at timestamptz; before_by uuid; begin
  select workflow_version,quality_checked_at,quality_checked_by into v,before_at,before_by from public.repair_access_orders where id=o;
  perform pg_temp.actor('admin_other');
  perform public.workshop_save(o,v,'{"quality_checked":true,"physical_location":"Estante B"}');
  perform pg_temp.check_that((select quality_checked_at=before_at and quality_checked_by=before_by from public.repair_access_orders where id=o),'Unrelated checked save rewrote QC timestamp/actor');
  perform pg_temp.actor('admin');
  raise notice 'PASS original QC timestamp and actor preserved';
exception when others then insert into pg_temp.workshop_failures values('quality timestamp',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_ready'); q uuid; v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza');
  q:=(public.workshop_request_part(o,gen_random_uuid(),'Fuente pendiente',2,'alta','',null)->>'id')::uuid;
  perform public.workshop_manage_part(q,1,'order',0,'Proveedor sintetico',15000,current_date+2,'');
  perform public.workshop_manage_part(q,2,'receive',1,null,null,null,'');
  select workflow_version into v from public.repair_access_orders where id=o;
  begin
    perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
    raise exception 'Ready accepted partially missing parts';
  exception when check_violation then null; end;
  perform pg_temp.check_that((select workflow_version=v and status<>'listo_para_retirar' and quality_checked_at is null from public.repair_access_orders where id=o),'Failed ready transition changed order/QC');
  perform public.workshop_manage_part(q,3,'receive',1,null,null,null,'');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
  perform pg_temp.check_that((select status='listo_para_retirar' from public.repair_access_orders where id=o),'Complete receipt did not unblock ready');
  raise notice 'PASS readiness blocks missing parts and preserves failed-save atomicity';
exception when others then insert into pg_temp.workshop_failures values('ready parts',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_install'); q uuid; v integer; before_stock integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza');
  q:=(public.workshop_request_part(o,gen_random_uuid(),'Fuente con reserva',2,'alta','',pg_temp.fixture('product'))->>'id')::uuid;
  perform public.workshop_manage_part(q,1,'reserve',2,null,null,null,'');
  select stock into before_stock from public.products where id=pg_temp.fixture('product');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'revoked','telefono','Cliente revoca el trabajo');
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_manage_part(q,2,'install',1,null,null,null,'');
    raise exception 'Installation accepted revoked approval';
  exception when check_violation then null; end;
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select installed_quantity=0 and reserved_quantity=2 and version=2 from public.repair_part_requests where id=q),'Rejected installation changed reservation');
  perform pg_temp.check_that((select stock=before_stock from public.products where id=pg_temp.fixture('product')),'Rejected installation changed stock');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Nueva autorizacion');
  perform pg_temp.actor('tech');
  perform public.workshop_manage_part(q,2,'install',1,null,null,null,'');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select installed_quantity=1 and reserved_quantity=1 and version=3 from public.repair_part_requests where id=q),'Authorized installation failed');
  perform pg_temp.check_that((select stock=before_stock-1 from public.products where id=pg_temp.fixture('product')),'Authorized install did not consume stock');
  raise notice 'PASS current approval required for installation and stock/reservation atomicity';
exception when others then insert into pg_temp.workshop_failures values('installation approval',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_legacy'); q uuid; v integer; begin
  q:=(public.workshop_request_part(o,gen_random_uuid(),'Fuente historica',1,'normal','',null)->>'id')::uuid;
  perform public.workshop_manage_part(q,1,'order',0,'Proveedor sintetico',10,current_date,'Compra excepcional documentada');
  perform public.workshop_manage_part(q,2,'receive',1,null,null,null,'');
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_manage_part(q,3,'install',1,null,null,null,'No inventar consentimiento');
    raise exception 'Installation accepted historical legacy state';
  exception when check_violation then null; end;
  select (public.get_workshop_context(array[o])->0->>'version')::integer into v;
  perform public.workshop_save(o,v,'{"status":"en_pruebas","repair_progress":"Revision de trabajo historico"}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select approval_status='legacy' and approved_amount is null and approved_at is null from public.repair_access_orders where id=o),'Historical continuation fabricated approval');
  select workflow_version into v from public.repair_access_orders where id=pg_temp.fixture('order_modern');
  begin
    perform public.workshop_save(pg_temp.fixture('order_modern'),v,'{"status":"en_pruebas"}');
    raise exception 'Pending modern work inherited legacy exception';
  exception when check_violation then null; end;
  raise notice 'PASS legacy continuation does not authorize installation or fabricate consent';
exception when others then insert into pg_temp.workshop_failures values('historical legacy',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_receipt_legacy'); v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  begin
    perform public.workshop_decide(o,v,pg_temp.fixture('receipt_legacy_op'),'accepted','telefono','Historico');
    raise exception 'Legacy receipt replay fabricated a verified request';
  exception when check_violation then null; end;
  perform pg_temp.check_that((select approval_status='legacy' and approved_at is null from public.repair_access_orders where id=o),'Legacy receipt changed consent');
  raise notice 'PASS unverified historical decision receipts fail closed';
exception when others then insert into pg_temp.workshop_failures values('historical receipt',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_history'); v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza');
  select workflow_version into v from public.repair_access_orders where id=o;
  begin
    perform public.workshop_save(o,null,'{"physical_location":"no version"}');
    raise exception 'NULL version bypassed optimistic lock';
  exception when serialization_failure then null; end;
  perform public.workshop_save(o,v,'{"status":"en_reparacion"}');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"status":"en_pruebas"}');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"budget_amount":120000,"status":"listo_para_retirar","quality_checked":true}');
  perform pg_temp.check_that((select status='presupuestado' and approval_status='pending' from public.repair_access_orders where id=o),'Budget edit did not reset actual status');
  perform pg_temp.check_that((select count(*)=0 from public.repair_access_status_history where repair_order_id=o and next_status='listo_para_retirar'),'History invented a ready state');
  perform pg_temp.check_that((select count(*)=1 from public.repair_access_status_history where repair_order_id=o and previous_status='en_pruebas' and next_status='presupuestado'),'History did not record final trigger status');
  raise notice 'PASS new work-state history, actual trigger result and optimistic version';
exception when others then insert into pg_temp.workshop_failures values('status history',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_context'); begin
  perform pg_temp.check_that(public.get_workshop_context(array[o])->0->>'assignedTechnicianName'='WS-ROLLBACK tech','Context ignored the linked profile name');
  perform pg_temp.actor('tech');
  perform pg_temp.check_that(public.get_workshop_context(array[o])->0->>'assignedTechnicianName'='WS-ROLLBACK tech','Technician context omitted linked name');
  perform pg_temp.actor('admin');
  raise notice 'PASS assigned profile name in admin and technician context';
exception when others then insert into pg_temp.workshop_failures values('assignment context',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_assignment'); v integer; bad uuid; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,jsonb_build_object('technician_id',pg_temp.fixture('tech_other')));
  perform pg_temp.check_that((select technician_name='WS-ROLLBACK tech_other' from public.repair_access_orders where id=o),'Assignment did not snapshot profile name');
  foreach bad in array array[pg_temp.fixture('admin'),pg_temp.fixture('employee'),gen_random_uuid()] loop
    select workflow_version into v from public.repair_access_orders where id=o;
    begin
      perform public.workshop_save(o,v,jsonb_build_object('technician_id',bad));
      raise exception 'Assignment accepted a non-technician or missing account';
    exception when check_violation then null; end;
  end loop;
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"technician_id":null}');
  perform pg_temp.check_that((select technician_id is null and technician_name='WS-ROLLBACK tech_other' from public.repair_access_orders where id=o),'Clearing assignment erased historic name');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,jsonb_build_object('technician_id',pg_temp.fixture('tech_deleted')));
  delete from public.profiles where id=pg_temp.fixture('tech_deleted');
  perform pg_temp.check_that((select technician_id is null and technician_name='WS-ROLLBACK tech_deleted' from public.repair_access_orders where id=o),'Profile deletion erased historic assignment snapshot');
  perform pg_temp.check_that(public.get_workshop_context(array[o])->0->>'assignedTechnicianName'='WS-ROLLBACK tech_deleted','Context did not fall back to historic name');
  raise notice 'PASS technician-only assignment, snapshot, unassignment and profile deletion';
exception when others then insert into pg_temp.workshop_failures values('assignment snapshot',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_foreign'); v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,jsonb_build_object('technician_id',pg_temp.fixture('tech_other')));
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_save(o,v,'{"technician_name":"Suplantacion de otra cuenta"}');
    raise exception 'Technician spoofed a foreign account-linked name';
  exception when insufficient_privilege then null; end;
  perform public.workshop_save(o,v,'{"technician_name":"WS-ROLLBACK tech_other","physical_location":"Estante C"}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select technician_id=pg_temp.fixture('tech_other') and technician_name='WS-ROLLBACK tech_other' from public.repair_access_orders where id=o),'Account-linked assignment was overwritten');
  raise notice 'PASS foreign linked-name protection and unchanged-name form compatibility';
exception when others then insert into pg_temp.workshop_failures values('foreign assignment name',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_delivery'); v integer; details jsonb; recipient text:='WS-PRIVATE recipient'; note text:='WS-PRIVATE balance exception'; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_deliver(o,v,recipient,note,true);
  perform public.workshop_deliver(o,v,recipient,note,true);
  perform pg_temp.check_that((select count(*)=1 from public.workshop_events where order_id=o and kind='delivery' and message='Entrega registrada por mostrador'),'Delivery event was not sanitized/idempotent');
  select changes into details from public.audit_logs where entity_type='repair_access_orders' and entity_id=o::text and changes->>'operation'='workshop_delivery';
  perform pg_temp.check_that(details->>'recipient'=recipient and details->>'notes'=note and (details->>'allow_balance')::boolean,'Admin audit did not preserve delivery details');
  perform pg_temp.check_that((select count(*)=1 from public.audit_logs where entity_type='repair_access_orders' and entity_id=o::text and changes->>'operation'='workshop_delivery'),'Replay duplicated delivery audit');
  perform pg_temp.actor('tech');
  perform pg_temp.check_that(position('WS-PRIVATE' in public.get_workshop_context(array[o])::text)=0,'Ops context exposed private delivery details');
  perform pg_temp.check_that((select count(*)=0 from public.audit_logs where entity_type='repair_access_orders' and entity_id=o::text),'Technician could read admin delivery audit');
  perform pg_temp.actor('admin');
  raise notice 'PASS sanitized delivery events, admin-only full details and replay';
exception when others then insert into pg_temp.workshop_failures values('delivery privacy',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_claim'); a uuid:=pg_temp.fixture('order_claim_admin'); v integer; r jsonb; before_row jsonb; begin
  select workflow_version,to_jsonb(t)-array['technician_id','technician_name','updated_by','updated_at','workflow_version'] into v,before_row from public.repair_access_orders t where id=o;
  perform pg_temp.actor('tech');
  r:=public.workshop_claim_order(o,v);
  perform pg_temp.check_that(r->>'assignedTechnicianId'=pg_temp.fixture('tech')::text and r->>'assignedTechnicianName'='WS-ROLLBACK tech','Claim did not assign the caller');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select to_jsonb(t)-array['technician_id','technician_name','updated_by','updated_at','workflow_version']=before_row from public.repair_access_orders t where id=o),'Claim changed non-assignment business fields');
  perform pg_temp.check_that((select count(*)=1 from public.workshop_tasks where order_id=o and kind='work' and assigned_to=pg_temp.fixture('tech') and resolved_at is null),'Claim did not assign the work task');
  perform pg_temp.check_that((select count(*)=1 from public.workshop_events where order_id=o and kind='assignment' and actor_id=pg_temp.fixture('tech')),'Claim did not log actor');
  perform pg_temp.actor('tech_other');
  begin
    perform public.workshop_claim_order(o,(r->>'version')::integer);
    raise exception 'Claim stole another technician order';
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('employee');
  begin
    perform public.workshop_claim_order(a,1);
    raise exception 'Customer could claim an order';
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('admin');
  select workflow_version into v from public.repair_access_orders where id=a;
  r:=public.workshop_claim_order(a,v);
  perform pg_temp.check_that(r->>'assignedTechnicianId'=pg_temp.fixture('admin')::text,'Admin self-claim failed');
  raise notice 'PASS bounded self-claim, role limit, no steal, actor/tasks and no financial changes';
exception when others then insert into pg_temp.workshop_failures values('self claim',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_claim_guard'); begin
  -- Fixture-owner role bypasses RLS to prove that the assignment trigger itself is a boundary.
  perform pg_temp.actor('tech');
  execute 'reset role';
  begin
    update public.repair_access_orders set technician_id=pg_temp.fixture('tech'),is_paid=true,updated_by=auth.uid() where id=o;
    raise exception 'Direct self-claim changed financial fields';
  exception when insufficient_privilege then null; end;
  update public.repair_access_orders set technician_id=pg_temp.fixture('tech'),updated_by=auth.uid() where id=o;
  begin
    update public.repair_access_orders set approval_status='accepted',approved_amount=999,updated_by=auth.uid() where id=o;
    raise exception 'Direct technician update forged customer approval';
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('tech_other');
  begin
    update public.repair_access_orders set technician_id=pg_temp.fixture('tech_other'),updated_by=auth.uid() where id=o;
    raise exception 'Direct update stole assigned order';
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('admin');
  execute 'set local role authenticated';
  perform pg_temp.check_that((select technician_id=pg_temp.fixture('tech') and technician_name='WS-ROLLBACK tech' and not is_paid from public.repair_access_orders where id=o),'Direct claim guard corrupted snapshot/business fields');
  raise notice 'PASS direct-update assignment boundary without RLS broadening';
exception when others then execute 'set local role authenticated'; insert into pg_temp.workshop_failures values('claim trigger',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_quote_qc'); v integer; old_qc timestamptz; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"quality_checked":true,"final_amount":0}');
  select workflow_version,quality_checked_at into v,old_qc from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"budget_amount":150000,"budget_detail":"Nuevo alcance","quality_checked":true}');
  perform pg_temp.check_that((select quality_checked_at is null and quality_checked_by is null and approval_status='pending' and final_amount is null and budget_amount=150000 from public.repair_access_orders where id=o),'New quote reused QC or treated estimate as final price');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza nuevo alcance');
  select workflow_version into v from public.repair_access_orders where id=o;
  begin
    perform public.workshop_save(o,v,'{"status":"listo_para_retirar"}');
    raise exception 'Fresh quote marked ready using old QC';
  exception when check_violation then null; end;
  perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
  perform pg_temp.check_that((select status='listo_para_retirar' and quality_checked_at is not null from public.repair_access_orders where id=o),'Fresh QC did not unblock ready');
  raise notice 'PASS quote revision invalidates QC and mobile estimate remains non-final';
exception when others then insert into pg_temp.workshop_failures values('quote QC',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_technical_save'); v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autorizacion de prueba real de rol');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform public.workshop_save(o,v,'{"status":"en_reparacion","budget_amount":100000,"budget_detail":"Fuente sintetica","repair_progress":"Avance tecnico actualizado","quality_checked":false}');
  select (public.get_workshop_context(array[o])->0->>'version')::integer into v;
  perform public.workshop_save(o,v,'{"quality_checked":true,"physical_location":"Banco tecnico","next_action_date":"2026-10-06"}');
  select (public.get_workshop_context(array[o])->0->>'version')::integer into v;
  perform public.workshop_save(o,v,'{"budget_amount":140000,"budget_detail":"Nuevo alcance tecnico","quality_checked":true}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select status='presupuestado' and budget_revision=2 and approval_status='pending'
    and approved_amount is null and quality_checked_at is null and final_amount is null and repair_progress='Avance tecnico actualizado'
    and repair_started_at is not null from public.repair_access_orders where id=o),'Real authenticated technician save failed derived/operational compatibility');
  raise notice 'PASS real authenticated technician save, derived dates, QC and quote invalidation';
exception when others then insert into pg_temp.workshop_failures values('real technician save',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_rls_security'); before_row jsonb; before_events bigint; affected bigint; begin
  select to_jsonb(t) into before_row from public.repair_access_orders t where id=o;
  select count(*) into before_events from public.workshop_events where order_id=o;
  perform pg_temp.actor('tech');
  begin
    update public.repair_access_orders set approval_status='accepted',approved_amount=999999,approved_at=now(),
      budget_revision=9999,workflow_version=9999,quality_checked_by=pg_temp.fixture('tech_other'),updated_by=auth.uid() where id=o;
    get diagnostics affected=row_count;
    perform pg_temp.check_that(affected=0,'Authenticated technician direct SQL updated a protected row');
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select to_jsonb(t)=before_row from public.repair_access_orders t where id=o),'Denied RLS update changed the fixture');
  perform pg_temp.check_that((select count(*)=before_events from public.workshop_events where order_id=o),'Denied RLS update wrote an event');
  raise notice 'PASS direct authenticated technician SQL has no protected writes';
exception when others then insert into pg_temp.workshop_failures values('authenticated SQL boundary',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_security'); before_row jsonb; before_events bigint; attack text; v integer; begin
  select to_jsonb(t) into before_row from public.repair_access_orders t where id=o;
  select count(*) into before_events from public.workshop_events where order_id=o;
  perform pg_temp.actor('tech');
  -- RPCs are definer functions: exercise their trigger boundary with the same
  -- caller claims while the fixture owner bypasses table RLS, not the trigger.
  execute 'reset role';
  foreach attack in array array[
    'approval_status=''accepted''', 'approval_status=''pending''', 'approval_status=''revoked''',
    'approved_amount=999999', 'approved_at=now()', 'budget_revision=9999', 'budget_revision=budget_revision+1',
    'quality_checked_by=pg_temp.fixture(''tech_other'')',
    'quality_checked_at=now(),quality_checked_by=pg_temp.fixture(''tech_other'')',
    'quality_checked_at=now()-interval ''1 day'',quality_checked_by=auth.uid()',
    'paid_at=now()', 'is_paid=true', 'final_amount=1'
  ] loop
    begin
      execute format('update public.repair_access_orders set %s,updated_by=auth.uid() where id=$1',attack) using o;
      raise exception 'Unchecked protected-field attack succeeded: %',attack;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    update public.repair_access_orders set updated_by=pg_temp.fixture('tech_other') where id=o;
    raise exception 'Technician forged another update actor';
  exception when insufficient_privilege then null; end;
  perform pg_temp.check_that((select to_jsonb(t)=before_row from public.repair_access_orders t where id=o),'Rejected trigger attacks left row changes');
  perform pg_temp.check_that((select count(*)=before_events from public.workshop_events where order_id=o),'Rejected trigger attacks wrote events');
  select workflow_version into v from public.repair_access_orders where id=o;
  update public.repair_access_orders set workflow_version=9999,budget_response_at=now()+interval '1 day',updated_by=auth.uid() where id=o;
  perform pg_temp.check_that((select workflow_version=v+1 and budget_response_at is not distinct from (before_row->>'budget_response_at')::timestamptz
    and approval_status='legacy' and approved_amount is null and approved_at is null and budget_revision=0 from public.repair_access_orders where id=o),
    'Client version/response date was not clamped by workflow guards');
  perform pg_temp.actor('admin');
  execute 'set local role authenticated';
  raise notice 'PASS trigger rejects approval/revision/QC/money/actor forgery; client version and response date clamp';
exception when others then execute 'set local role authenticated'; insert into pg_temp.workshop_failures values('derived field security',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_security_rpc'); v integer; qc timestamptz; revision integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Consentimiento real de mostrador');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform public.workshop_save(o,v,'{"status":"en_pruebas","quality_checked":true}');
  perform pg_temp.actor('admin');
  select workflow_version,quality_checked_at,budget_revision into v,qc,revision from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform public.workshop_save(o,v,'{"budget_amount":130000,"budget_detail":"Nuevo alcance de seguridad","quality_checked":true,"approval_status":"accepted","approved_amount":999999,"approved_at":"2026-10-01","budget_revision":9999,"workflow_version":9999,"quality_checked_by":"00000000-0000-4000-8000-000000000099"}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select approval_status='pending' and approved_amount is null and approved_at is null and budget_revision=revision+1
    and workflow_version=v+1 and quality_checked_at is null and quality_checked_by is null from public.repair_access_orders where id=o),
    'Technical RPC did not restrict new metadata to automatic quote invalidation');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_manage_part((public.workshop_request_part(o,gen_random_uuid(),'Repuesto de seguridad',1,'normal','',null)->>'id')::uuid,1,'install',1,null,null,null,'');
    raise exception 'Pending quote allowed part installation';
  exception when check_violation then
    perform pg_temp.check_that(position('autorizacion vigente' in sqlerrm)>0,'Installation rejected for the wrong reason');
  end;
  perform pg_temp.actor('admin');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','telefono','Autoriza alcance actualizado');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":false}');
    raise exception 'Technician marked ready without explicit fresh QC';
  exception when check_violation then
    perform pg_temp.check_that(position('control de calidad' in sqlerrm)>0,'Ready rejected for the wrong reason');
  end;
  perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select status='listo_para_retirar' and quality_checked_at=now() and quality_checked_by=pg_temp.fixture('tech')
    from public.repair_access_orders where id=o),'Explicit technical QC did not record the actual actor/time');
  raise notice 'PASS real technical RPC ignores forged metadata, invalidates quote, blocks installation and requires explicit fresh QC';
exception when others then insert into pg_temp.workshop_failures values('quote and QC security RPC',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_final_price'); v integer; before_row jsonb; begin
  select workflow_version,to_jsonb(t) into v,before_row from public.repair_access_orders t where id=o;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_save(o,v,'{"final_amount":1}');
    raise exception 'Technician RPC changed final financial price';
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select to_jsonb(t)=before_row from public.repair_access_orders t where id=o),'Rejected final-price RPC changed row');
  perform pg_temp.actor('tech');
  perform public.workshop_save(o,v,'{"budget_amount":150000,"budget_detail":"Propuesta tecnica revisada"}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select final_amount=100000 and budget_amount=150000 and approval_status='pending' and not is_paid from public.repair_access_orders where id=o),'Quote proposal changed booked final price or paid status');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"final_amount":120000}');
  perform pg_temp.check_that((select final_amount=120000 from public.repair_access_orders where id=o),'Admin final-price path failed');
  raise notice 'PASS technician cannot change financial final price; quote proposals preserve it; admin path works';
exception when others then insert into pg_temp.workshop_failures values('final price authority',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_no_consent'); v integer; before_row jsonb; begin
  select workflow_version,to_jsonb(t) into v,before_row from public.repair_access_orders t where id=o;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
    raise exception 'Pending quote became ready with QC but no consent';
  exception when check_violation then
    perform pg_temp.check_that(position('autorizacion vigente' in sqlerrm)>0,'Ready denied for the wrong reason');
  end;
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select to_jsonb(t)=before_row from public.repair_access_orders t where id=o),'Rejected consent bypass changed row');
  select workflow_version into v from public.repair_access_orders where id=pg_temp.fixture('order_legacy');
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_save(pg_temp.fixture('order_legacy'),v,'{"status":"listo_para_retirar","quality_checked":true}');
    raise exception 'Legacy continuation fabricated consent for ready';
  exception when check_violation then null; end;
  perform pg_temp.actor('admin');
  perform public.workshop_decide(o,(before_row->>'workflow_version')::integer,gen_random_uuid(),'accepted','telefono','Consentimiento explicito');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select status='listo_para_retirar' and approval_status='accepted' from public.repair_access_orders where id=o),'Recorded current consent did not unblock ready');
  raise notice 'PASS pending/legacy readiness requires real current acceptance, not only QC';
exception when others then insert into pg_temp.workshop_failures values('ready consent',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_free'); v integer; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','presencial','Garantia sin cargo');
    raise exception 'Technician authorized zero-price repair';
  exception when insufficient_privilege then null; end;
  perform pg_temp.actor('admin');
  begin
    perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','presencial','Garantia sin cargo');
    raise exception 'Zero quote without scope was authorized';
  exception when check_violation then null; end;
  perform public.workshop_save(o,v,'{"budget_amount":0,"budget_detail":"Garantia sin cargo: reemplazo de fuente"}');
  select workflow_version into v from public.repair_access_orders where id=o;
  begin
    perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','presencial','');
    raise exception 'Zero quote without explicit reason was authorized';
  exception when check_violation then null; end;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','presencial','Garantia sin cargo autorizada por mostrador');
  perform pg_temp.check_that((select approved_amount=0 and approved_at is not null and approval_status='accepted' and not is_paid from public.repair_access_orders where id=o),'Free authorization fabricated payment or omitted recorded consent');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform public.workshop_save(o,v,'{"status":"listo_para_retirar","quality_checked":true}');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select status='listo_para_retirar' and not is_paid from public.repair_access_orders where id=o),'Explicit free warranty authorization cannot finish safely');
  raise notice 'PASS zero quote requires admin, explicit scope/reason and recorded acceptance; no automatic paid flag';
exception when others then insert into pg_temp.workshop_failures values('free authorization',sqlerrm); end $$;

do $$ declare o uuid:=pg_temp.fixture('order_part_replay'); op uuid:=gen_random_uuid(); q uuid; v integer; before_version integer; attack jsonb; begin
  perform pg_temp.actor('tech');
  q:=(public.workshop_request_part(o,op,'Fuente exacta',2,'alta','Nota original',pg_temp.fixture('product'))->>'id')::uuid;
  perform pg_temp.actor('admin');
  select workflow_version into before_version from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform pg_temp.check_that((public.workshop_request_part(o,op,'Fuente exacta',2,'alta','Nota original',pg_temp.fixture('product'))->>'replayed')::boolean,'Exact part retry did not replay');
  for attack in select value from jsonb_array_elements('[{"description":"Fuente distinta"},{"quantity":3},{"priority":"urgente"},{"notes":"Otra nota"},{"product":false}]') loop
    begin
      perform public.workshop_request_part(o,op,coalesce(attack->>'description','Fuente exacta'),coalesce((attack->>'quantity')::integer,2),
        coalesce(attack->>'priority','alta'),coalesce(attack->>'notes','Nota original'),case when attack ? 'product' then null else pg_temp.fixture('product') end);
      raise exception 'Part operation replay accepted altered payload: %',attack;
    exception when check_violation then null; end;
  end loop;
  perform pg_temp.actor('tech_other');
  begin
    perform public.workshop_request_part(o,op,'Fuente exacta',2,'alta','Nota original',pg_temp.fixture('product'));
    raise exception 'Part retry accepted another actor';
  exception when check_violation then null; end;
  perform pg_temp.actor('tech');
  begin
    perform public.workshop_request_part(pg_temp.fixture('order_part_legacy'),op,'Fuente exacta',2,'alta','Nota original',pg_temp.fixture('product'));
    raise exception 'Part retry accepted another order';
  exception when check_violation then null; end;
  begin
    perform public.workshop_request_part(pg_temp.fixture('order_part_legacy'),pg_temp.fixture('part_legacy_op'),'Repuesto historico',1,'normal','Nota historica',null);
    raise exception 'Historical part receipt was treated as verified';
  exception when check_violation then null; end;
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select workflow_version=before_version from public.repair_access_orders where id=o),'Replay altered order version');
  perform pg_temp.check_that((select count(*)=1 from public.repair_part_requests where order_id=o),'Part retries duplicated requests');
  perform public.workshop_manage_part(q,1,'order',0,'Proveedor',100,current_date,'Compra excepcional con nota distinta');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform pg_temp.actor('tech');
  perform pg_temp.check_that((public.workshop_request_part(o,op,'Fuente exacta',2,'alta','Nota original',pg_temp.fixture('product'))->>'replayed')::boolean,'Managed request lost its original retry fingerprint');
  perform pg_temp.actor('admin');
  perform pg_temp.check_that((select workflow_version=v from public.repair_access_orders where id=o),'Stale original retry mutated a managed order');
  raise notice 'PASS part request replay binds actor and every payload field; historical/managed stale receipts remain safe';
exception when others then insert into pg_temp.workshop_failures values('part request replay',sqlerrm); end $$;

do $$ declare k text; o uuid; v integer; before_row jsonb; after_row jsonb; page jsonb; begin
  foreach k in array array['order_legacy_accepted_quote','order_legacy_work_quote','order_legacy_tests_quote'] loop
    begin
      o:=pg_temp.fixture(k);
      perform pg_temp.actor('admin');
      select to_jsonb(t),workflow_version into before_row,v from public.repair_access_orders t where id=o;
      perform pg_temp.check_that(before_row->>'approval_status'='legacy' and (before_row->>'budget_amount')::numeric=100,'Legacy quote fixture is not historical');
      perform pg_temp.actor('tech');
      perform public.workshop_save(o,v,jsonb_build_object('status',before_row->>'status','budget_amount',110,'budget_detail','Fuente sintetica','quality_checked',true));
      perform pg_temp.actor('admin');
      select to_jsonb(t) into after_row from public.repair_access_orders t where id=o;
      perform pg_temp.check_that(after_row->>'status'='presupuestado' and after_row->>'approval_status'='pending','Legacy quote change retained accepted/in-progress status');
      perform pg_temp.check_that((after_row->>'budget_amount')::numeric=110 and (after_row->>'budget_revision')::integer=(before_row->>'budget_revision')::integer+1
        and (after_row->>'workflow_version')::integer=v+1,'Legacy quote revision/version did not advance exactly once');
      perform pg_temp.check_that(after_row->>'approved_amount' is null and after_row->>'approved_at' is null
        and after_row->>'quality_checked_at' is null and after_row->>'quality_checked_by' is null,'Legacy quote retained consent or old QC');
      perform pg_temp.check_that(after_row->'repair_started_at'=before_row->'repair_started_at' and after_row->'finished_at'=before_row->'finished_at'
        and after_row->'reviewed_at'=before_row->'reviewed_at','Discarded phase fabricated a work timestamp');
      perform pg_temp.check_that((select count(*)=0 from public.repair_customer_decisions where order_id=o),'Legacy quote fabricated customer consent');
      perform pg_temp.check_that((select count(*)=1 from public.workshop_tasks where order_id=o and kind='approval' and resolved_at is null),'Legacy quote did not open approval task');
      perform pg_temp.check_that((select count(*)=1 from public.repair_budget_versions where order_id=o and revision=(after_row->>'budget_revision')::integer and amount=110),'Legacy quote version was not recorded');
      perform pg_temp.check_that((select count(*)=1 from public.repair_access_status_history where repair_order_id=o
        and previous_status=before_row->>'status' and next_status='presupuestado' and changed_by=pg_temp.fixture('tech')),'Legacy quote history ignored actual trigger status/actor');
      perform pg_temp.check_that((select count(*)=1 from public.workshop_events where order_id=o and kind='update'
        and message='Estado: presupuestado' and actor_id=pg_temp.fixture('tech')),'Legacy quote event did not record actual status');
      perform pg_temp.actor('tech');
      page:=public.workshop_read_page('WS-ROLLBACK-'||o,'todos','todos','approved',null,null,1);
      perform pg_temp.check_that((page->>'total')::integer=0 and jsonb_array_length(page->'orders')=0,'Changed legacy quote remains in approved scope');
      page:=public.workshop_read_page('WS-ROLLBACK-'||o,'todos','todos','waiting_customer',null,null,1);
      perform pg_temp.check_that((page->>'total')::integer=1 and page->'orders'->0->>'id'=o::text,'Changed legacy quote is missing from waiting-customer scope');
      begin
        perform public.workshop_save(o,v,'{"budget_amount":120}');
        raise exception 'Stale legacy quote save was accepted';
      exception when serialization_failure then null; end;
      begin
        perform public.workshop_save(o,v+1,'{"status":"listo_para_retirar","quality_checked":true}');
        raise exception 'Changed legacy quote became ready without new consent';
      exception when check_violation then null; end;
      perform pg_temp.actor('admin');
      perform pg_temp.check_that((select to_jsonb(t)=after_row from public.repair_access_orders t where id=o),'Rejected legacy quote update changed state');
      perform pg_temp.actor('tech');
      perform public.workshop_save(o,v+1,'{"budget_amount":110,"quality_notes":"Pendiente nueva autorizacion"}');
      perform pg_temp.actor('admin');
      perform pg_temp.check_that((select status='presupuestado' and approval_status='pending' and budget_revision=(after_row->>'budget_revision')::integer
        from public.repair_access_orders where id=o),'Unchanged legacy quote echo changed its pending revision');
      perform pg_temp.check_that((select count(*)=1 from public.workshop_tasks where order_id=o and kind='approval' and resolved_at is null),'Legacy quote echo duplicated approval task');
      perform pg_temp.check_that((select count(*)=1 from public.repair_access_status_history where repair_order_id=o),'Legacy quote echo invented another status transition');
      raise notice 'PASS authenticated technician %: 100->110 resets pending/presupuestado, task/history/scopes, stale/QC denial',k;
    exception when others then insert into pg_temp.workshop_failures values(k,sqlerrm); end;
  end loop;
  perform pg_temp.actor('admin');
end $$;

reset role;
table workshop_failures;
do $$ declare v_errors text; begin
  select string_agg(case_name||': '||message,E'\n' order by case_name) into v_errors from pg_temp.workshop_failures;
  if v_errors is not null then raise exception E'Workshop regressions failed:\n%',v_errors; end if;
end $$;
select array_agg(id)::text as rollback_fixture_ids from workshop_fixture \gset
rollback;
select set_config('chetech.workshop_test_ids',:'rollback_fixture_ids',false);
do $$ declare ids uuid[]:=current_setting('chetech.workshop_test_ids')::uuid[]; begin
  if exists(select 1 from public.profiles where id=any(ids))
    or exists(select 1 from auth.users where id=any(ids))
    or exists(select 1 from public.repair_access_orders where id=any(ids))
    or exists(select 1 from public.repair_access_customers where id=any(ids))
    or exists(select 1 from public.repair_access_devices where id=any(ids))
    or exists(select 1 from public.products where id=any(ids)) then
    raise exception 'A synthetic fixture survived rollback';
  end if;
end $$;
select 'PASS: 27 scoped workshop suites; all synthetic rows rolled back' as verification;
