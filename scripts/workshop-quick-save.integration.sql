\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$ begin
  if current_database()<>'chetech_staging' then raise exception 'Local staging database required'; end if;
end $$;
create temporary table quick_fixture(key text primary key,id uuid not null default gen_random_uuid());
insert into quick_fixture(key) values ('admin'),('other_admin'),('tech'),('customer'),('device'),
  ('ready'),('no_consent'),('no_qc'),('parts'),('role'),('changed'),('ordinary'),('free'),('legacy_ready'),('missing_quote'),('invalid'),('persisted_nan'),('paid'),('quick_accepted'),('quick_rejected');
grant select on quick_fixture to authenticated;
create function pg_temp.qid(k text) returns uuid language sql stable as $$ select id from pg_temp.quick_fixture where key=k $$;
create function pg_temp.qactor(k text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(k),'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',pg_temp.qid(k)::text,true);
end $$;
create function pg_temp.qcheck(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is not true then raise exception '%',message; end if;
end $$;
insert into auth.users(id,email) select id,key||'-'||id||'@quick-save.invalid' from quick_fixture where key in ('admin','other_admin','tech');
insert into public.profiles(id,full_name,role) select id,'QUICK-ROLLBACK '||key,case when key='tech' then 'tecnico' else 'admin' end from quick_fixture where key in ('admin','other_admin','tech');
select pg_temp.qactor('admin');
insert into public.repair_access_customers(id,full_name) values(pg_temp.qid('customer'),'QUICK-ROLLBACK synthetic customer');
insert into public.repair_access_devices(id,customer_id,device_type) values(pg_temp.qid('device'),pg_temp.qid('customer'),'Synthetic TV');
insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,budget_amount,budget_detail,budgeted_at,status)
select id,pg_temp.qid('customer'),pg_temp.qid('device'),'QUICK-ROLLBACK '||key,100,'Synthetic scope',now(),'presupuestado'
from quick_fixture where key not in ('admin','other_admin','tech','customer','device');
update public.repair_access_orders set budget_amount=null where id=pg_temp.qid('missing_quote');
update public.repair_access_orders set intake_date='2099-01-01' where id in (pg_temp.qid('quick_accepted'),pg_temp.qid('quick_rejected'));
update public.repair_access_orders set is_paid=true,paid_at=now() where id=pg_temp.qid('paid');
-- Existing ready records may predate the new authorization workflow.
alter table public.repair_access_orders disable trigger user;
update public.repair_access_orders set status='listo_para_retirar',approval_status='legacy' where id=pg_temp.qid('legacy_ready');
update public.repair_access_orders set budget_amount='NaN'::numeric where id=pg_temp.qid('persisted_nan');
alter table public.repair_access_orders enable trigger user;
create function pg_temp.qhistory(o uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'order',(select to_jsonb(t) from public.repair_access_orders t where id=o),
 'quotes',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.repair_budget_versions t where order_id=o),
 'decisions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.repair_customer_decisions t where order_id=o),
 'events',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.workshop_events t where order_id=o),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.workshop_tasks t where order_id=o),
 'receipts',(select coalesce(jsonb_agg(to_jsonb(t) order by operation_id),'[]'::jsonb) from private.workshop_quick_save_receipts t where order_id=o))
$$;
create function pg_temp.qmoney() returns jsonb language sql as $$ select jsonb_build_object(
 'stock',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.products p),
 'cash',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.movimientos_caja p),
 'payments',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.repair_payments p),
 'access_payments',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.repair_access_payments p),
 'invoices',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.invoices p)) $$;
create temporary table quick_money_before as select pg_temp.qmoney() as data;
grant select on quick_money_before to authenticated;
set local role authenticated;

do $$ declare k text; o uuid; v integer; op uuid; r jsonb; snapshot jsonb; begin
  foreach k in array array['quick_accepted','quick_rejected'] loop
    o:=pg_temp.qid(k); op:=gen_random_uuid();
    select workflow_version into v from public.repair_access_orders where id=o;
    r:=public.workshop_save_quick(o,v,op,jsonb_build_object('status',case k when 'quick_accepted' then 'presupuestado_aceptado' else 'presupuestado_rechazado' end,
      'budget_amount',150,'budget_detail','Updated scope','repair_progress','Client responded'),true,'telefono','Explicit client response');
    perform pg_temp.qcheck((select status=case k when 'quick_accepted' then 'presupuestado_aceptado' else 'presupuestado_rechazado' end
      and approval_status=case k when 'quick_accepted' then 'accepted' else 'rejected' end and budget_amount=150 and not is_paid and delivered_at is null
      from public.repair_access_orders where id=o),'Quick decision did not preserve selected state or fabricated money/delivery');
    perform pg_temp.qcheck((select count(*)=1 from public.repair_customer_decisions d join public.repair_budget_versions b on b.id=d.budget_version_id
      where d.order_id=o and b.amount=150 and b.detail='Updated scope' and d.decision=case k when 'quick_accepted' then 'accepted' else 'rejected' end),'Quick decision not tied to exact saved quote');
    snapshot:=pg_temp.qhistory(o);
    r:=public.workshop_save_quick(o,v,op,jsonb_build_object('status',case k when 'quick_accepted' then 'presupuestado_aceptado' else 'presupuestado_rechazado' end,
      'budget_amount',150,'budget_detail','Updated scope','repair_progress','Client responded'),true,'telefono','Explicit client response');
    perform pg_temp.qcheck((r->>'replayed')::boolean and pg_temp.qhistory(o)=snapshot,'Quick decision retry duplicated history');
  end loop;
  o:=pg_temp.qid('quick_accepted'); select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_aceptado","repair_progress":"Another note"}',true,'presencial','');
  perform pg_temp.qcheck((select count(*)=1 from public.repair_customer_decisions where order_id=o),'Ordinary accepted edit duplicated decision');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"en_reparacion"}',false,'','');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_aceptado"}',true,'telefono','');
  perform pg_temp.qcheck((select status='presupuestado_aceptado' from public.repair_access_orders where id=o),'Could not return to accepted with existing consent');
  perform pg_temp.qcheck((select count(*)=1 from public.repair_customer_decisions where order_id=o),'Returning to accepted duplicated valid consent');
  select workflow_version into v from public.repair_access_orders where id=o; snapshot:=pg_temp.qhistory(o);
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_rechazado"}',true,'presencial','');
    raise exception 'Accepted budget rejected without reason';
  exception when check_violation then null; end;
  perform pg_temp.qcheck(pg_temp.qhistory(o)=snapshot,'Missing rejection reason changed history');
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_rechazado"}',true,'presencial','Cliente cambio de decision');
  perform pg_temp.qcheck((select status='presupuestado_rechazado' and approval_status='rejected' and approved_amount is null from public.repair_access_orders where id=o),'Explicit rejection did not revoke prior acceptance');
  perform pg_temp.qcheck((select count(*)=1 from public.repair_customer_decisions where order_id=o and decision='revoked'),'Prior consent was erased instead of revoked');
  perform pg_temp.qcheck((select d.created_at>r.created_at from public.repair_customer_decisions d join public.repair_customer_decisions r on r.order_id=d.order_id
    where d.order_id=o and d.decision='rejected' and r.decision='revoked'),'Atomic rejection does not sort after its revocation in reports');
  perform pg_temp.qcheck((public.get_workshop_business_report('2099-01-01','2099-01-01')->'totals'->>'rejectedCurrent')::integer=2,'Business report did not count the final rejection');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_aceptado"}',true,'telefono','Cliente acepto nuevamente');
  perform pg_temp.qcheck((select approval_status='accepted' and approved_amount=150 from public.repair_access_orders where id=o),'Rejected budget could not be accepted again');
  perform pg_temp.qcheck((public.get_workshop_business_report('2099-01-01','2099-01-01')->'totals'->>'acceptedCurrent')::integer=1,'Business report did not count the new acceptance');
  select workflow_version into v from public.repair_access_orders where id=o; snapshot:=pg_temp.qhistory(o);
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_rechazado"}',false,'','');
    raise exception 'Status bypassed explicit decision';
  exception when check_violation then null; end;
  perform pg_temp.qcheck(pg_temp.qhistory(o)=snapshot,'Status-only rejection bypass changed history');
  perform pg_temp.qactor('tech');
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"presupuestado_rechazado"}',true,'telefono','Forged response');
    raise exception 'Technical account recorded a customer rejection';
  exception when insufficient_privilege then null; end;
  perform pg_temp.qactor('admin');
  perform pg_temp.qcheck(pg_temp.qhistory(o)=snapshot,'Role bypass changed history');
  raise notice 'PASS direct budget acceptance/rejection, exact retry, consent reversal and role boundaries';
end $$;

do $$ declare k text; o uuid; v integer; before_history jsonb; payload jsonb; begin
  foreach k in array array['legacy_ready','missing_quote','persisted_nan','invalid'] loop
    o:=pg_temp.qid(k); select workflow_version into v from public.repair_access_orders where id=o;
    before_history:=pg_temp.qhistory(o);
    payload:=case k when 'legacy_ready' then '{"status":"listo_para_retirar","budget_amount":200}'::jsonb
      when 'missing_quote' then '{"status":"listo_para_retirar","quality_checked":true}'::jsonb
      when 'persisted_nan' then '{"status":"listo_para_retirar","quality_checked":true}'::jsonb
      else '{"status":"listo_para_retirar","budget_amount":"NaN","quality_checked":true}'::jsonb end;
    begin
      perform public.workshop_save_quick(o,v,gen_random_uuid(),payload,k<>'legacy_ready','presencial','Confirmacion explicita');
      raise exception 'Unsafe quote accepted: %',k;
    exception when check_violation then null; end;
    perform pg_temp.qcheck(pg_temp.qhistory(o)=before_history,'Rejected quote changed order/history/tasks/receipt: '||k);
    raise notice 'PASS % rejects unsafe ready/quote and rolls back all workflow records',k;
  end loop;
  o:=pg_temp.qid('invalid'); select workflow_version into v from public.repair_access_orders where id=o;
  before_history:=pg_temp.qhistory(o);
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"repair_progress":"Note"}',false,'',repeat('a',2001));
    raise exception 'Oversized ordinary notes accepted';
  exception when check_violation then null; end;
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"repair_progress":"Note"}',false,repeat('x',10000),'');
    raise exception 'Oversized ordinary channel accepted';
  exception when check_violation then null; end;
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"quality_checked":"true"}',false,'','');
    raise exception 'String boolean accepted';
  exception when check_violation then null; end;
  perform pg_temp.qcheck(pg_temp.qhistory(o)=before_history,'Invalid ordinary parameters left workflow writes');
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"budget_amount":100.005}',true,'presencial','Autorizo');
    raise exception 'Sub-cent precision accepted';
  exception when check_violation then null; end;
  perform pg_temp.qcheck(pg_temp.qhistory(o)=before_history,'Rounded quote left writes');
  o:=pg_temp.qid('paid'); select workflow_version into v from public.repair_access_orders where id=o;
  before_history:=pg_temp.qhistory(o);
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"budget_amount":200}',true,'presencial','Autorizo');
    raise exception 'Confirmation accepted a different paid quote';
  exception when check_violation then null; end;
  perform pg_temp.qcheck(pg_temp.qhistory(o)=before_history,'Protected quote confirmation left writes');
  o:=pg_temp.qid('missing_quote'); select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"repair_progress":"Diagnostico sin precio"}',false,'','');
  perform pg_temp.qcheck((select budget_amount is null from public.repair_access_orders where id=o),'Ordinary note converted absent quote to zero');
  raise notice 'PASS parameter types and ordinary metadata bounds';
end $$;

do $$ declare o uuid:=pg_temp.qid('ready'); op uuid:=gen_random_uuid(); v integer; saved integer; r jsonb; before_row jsonb; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  r:=public.workshop_save_quick(o,v,op,'{"status":"listo_para_retirar","budget_amount":208000,"budget_detail":"Cambio de main","repair_progress":"Probado","quality_checked":true}',true,'telefono','Cliente autorizo');
  select workflow_version,to_jsonb(t) into saved,before_row from public.repair_access_orders t where id=o;
  perform pg_temp.qcheck((select status='listo_para_retirar' and approval_status='accepted' and approved_amount=208000 and quality_checked_at is not null and not is_paid and delivered_at is null from public.repair_access_orders where id=o),'Atomic ready workflow did not complete or fabricated collection/delivery');
  perform pg_temp.qcheck((r->>'version')::integer=saved and (select count(*)=1 from public.repair_customer_decisions where order_id=o),'Wrong returned version or duplicate consent');
  r:=public.workshop_save_quick(o,v,op,'{"status":"listo_para_retirar","budget_amount":208000,"budget_detail":"Cambio de main","repair_progress":"Probado","quality_checked":true}',true,'telefono','Cliente autorizo');
  perform pg_temp.qcheck((r->>'replayed')::boolean and (select to_jsonb(t)=before_row from public.repair_access_orders t where id=o),'Exact retry changed order');
  begin
    perform public.workshop_save_quick(o,v,op,'{"status":"listo_para_retirar","budget_amount":208001}',true,'telefono','Cliente autorizo');
    raise exception 'Changed retry was accepted';
  exception when check_violation then null; end;
  perform pg_temp.qactor('other_admin');
  begin
    perform public.workshop_save_quick(o,v,op,'{"status":"listo_para_retirar","budget_amount":208000,"budget_detail":"Cambio de main","repair_progress":"Probado","quality_checked":true}',true,'telefono','Cliente autorizo');
    raise exception 'Another actor reused receipt';
  exception when check_violation then null; end;
  perform pg_temp.qactor('admin');
  raise notice 'PASS one-step explicit consent, QC, returned version and actor-bound exact retry';
end $$;

do $$ declare k text; o uuid; v integer; before_row jsonb; begin
  foreach k in array array['no_consent','no_qc','parts'] loop
    o:=pg_temp.qid(k);
    if k='parts' then perform public.workshop_request_part(o,gen_random_uuid(),'Missing synthetic part',2,'normal','',null); end if;
    select workflow_version into v from public.repair_access_orders where id=o;
    before_row:=pg_temp.qhistory(o);
    begin
      perform public.workshop_save_quick(o,v,gen_random_uuid(),jsonb_build_object('status','listo_para_retirar','budget_amount',150,'budget_detail','New scope','quality_checked',k<>'no_qc'),k<>'no_consent','presencial','Explicit answer');
      raise exception 'Blocked workflow was saved: %',k;
    exception when check_violation then null; end;
    perform pg_temp.qcheck(pg_temp.qhistory(o)=before_row,'Failed quick transition changed workflow history/tasks/receipt');
    perform pg_temp.qcheck((select count(*)=0 from public.repair_customer_decisions where order_id=o),'Failed quick save left partial consent');
    raise notice 'PASS % rolls back quote, consent and QC together',k;
  end loop;
end $$;

do $$ declare o uuid:=pg_temp.qid('role'); v integer; before_row jsonb; begin
  select workflow_version,to_jsonb(t) into v,before_row from public.repair_access_orders t where id=o;
  perform pg_temp.qactor('tech');
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"listo_para_retirar","quality_checked":true}',true,'presencial','Forged approval');
    raise exception 'Technician confirmed customer';
  exception when insufficient_privilege then null; end;
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"approval_status":"accepted","is_paid":true}',false,'','');
    raise exception 'Unknown admin payload was accepted';
  exception when check_violation or insufficient_privilege then null; end;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"en_revision","repair_progress":"Real technical note"}',false,'','');
  perform pg_temp.qactor('admin');
  perform pg_temp.qcheck((select approval_status='legacy' and not is_paid and quality_checked_at is null and repair_progress='Real technical note' from public.repair_access_orders where id=o),'Ordinary technician update fabricated consent or money');
  raise notice 'PASS technician ordinary save and approval/payload boundaries';
end $$;

do $$ declare o uuid:=pg_temp.qid('changed'); v integer; before_row jsonb; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_decide(o,v,gen_random_uuid(),'accepted','presencial','Original approval');
  select workflow_version into v from public.repair_access_orders where id=o;
  perform public.workshop_save(o,v,'{"quality_checked":true}');
  select workflow_version,to_jsonb(t) into v,before_row from public.repair_access_orders t where id=o;
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"listo_para_retirar","budget_amount":200}',false,'','');
    raise exception 'Old consent authorized new scope';
  exception when check_violation then null; end;
  perform pg_temp.qcheck((select to_jsonb(t)=before_row from public.repair_access_orders t where id=o),'Changed scope failed save changed history');
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"listo_para_retirar","budget_amount":200,"quality_checked":true}',true,'telefono','Accepted new amount');
  perform pg_temp.qcheck((select status='listo_para_retirar' and approved_amount=200 from public.repair_access_orders where id=o),'New explicit consent cannot complete revised quote');
  raise notice 'PASS quote changes require fresh explicit consent and QC';
end $$;

do $$ declare o uuid:=pg_temp.qid('ordinary'); op uuid:=gen_random_uuid(); v integer; r jsonb; begin
  select workflow_version into v from public.repair_access_orders where id=o;
  r:=public.workshop_save_quick(o,v,op,'{"repair_progress":"One click note"}',false,'','');
  perform pg_temp.qcheck((r->>'version')::integer=v+1,'Ordinary update should only advance one version');
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"repair_progress":"Stale"}',false,'','');
    raise exception 'Stale version was accepted';
  exception when serialization_failure then null; end;
  perform pg_temp.qcheck((public.workshop_save_quick(o,v,op,'{"repair_progress":"One click note"}',false,'','')->>'replayed')::boolean,'Ordinary retry failed');
  o:=pg_temp.qid('free'); select workflow_version into v from public.repair_access_orders where id=o;
  begin
    perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"listo_para_retirar","budget_amount":0,"budget_detail":"Garantia sin cargo","quality_checked":true}',true,'presencial','');
    raise exception 'Free authorization without reason was accepted';
  exception when check_violation then null; end;
  perform public.workshop_save_quick(o,v,gen_random_uuid(),'{"status":"listo_para_retirar","budget_amount":0,"budget_detail":"Garantia sin cargo","quality_checked":true}',true,'presencial','Trabajo de garantia');
  raise notice 'PASS ordinary version/retry and explicit free-work reason';
end $$;

select pg_temp.qactor('admin');
select pg_temp.qcheck(pg_temp.qmoney()=(select data from quick_money_before),'Quick workflow modified cash, stock, invoices or payments');
select pg_temp.qcheck(not has_function_privilege('anon','public.workshop_save_quick(uuid,integer,uuid,jsonb,boolean,text,text)','execute'),'Anonymous quick-save access');
select pg_temp.qcheck(not has_table_privilege('authenticated','private.workshop_quick_save_receipts','select'),'Receipt access exposed');
rollback;
select 'PASS quick workflow: explicit actions, atomic rollback, roles, retry, versions and unchanged finances; all fixtures rolled back' as verification;
