-- Read-only workshop analytics. No backfills, ledger writes or existing function changes.
begin;
create function public.get_workshop_business_report(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_from date := coalesce(p_from, date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_to date := coalesce(p_to, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Solo administradores pueden consultar el informe de negocio del taller.' using errcode = '42501';
  end if;
  if v_from > v_to then raise exception 'El periodo de ingreso no es valido.' using errcode = '22023'; end if;
  return (
    with cohort as materialized (
      select o.* from public.repair_access_orders o where intake_date between v_from and v_to
    ), decisions as (
      select distinct on (c.id) c.id, d.decision, b.amount
      from cohort c join public.repair_budget_versions b on b.order_id = c.id and b.revision = c.budget_revision
      join public.repair_customer_decisions d on d.order_id = c.id and d.budget_version_id = b.id
      order by c.id, d.created_at desc, d.id desc
    ), payment_rows as (
      select p.repair_order_id as order_id, p.amount
      from public.repair_access_payments p join cohort c on c.id = p.repair_order_id
      where p.voided_at is null and p.legacy_repair_payment_id is null
      union all
      select r.repair_access_order_id, p.amount from public.repair_payments p
      join public.repairs r on r.id = p.repair_id join cohort c on c.id = r.repair_access_order_id
    ), payments as (
      select order_id, sum(amount) as collected, count(*) as payment_count from payment_rows group by order_id
    ), legacy_prices as (
      select r.repair_access_order_id as order_id,
        case when count(distinct r.final_price) = 1 then max(r.final_price) end as amount
      from public.repairs r join cohort c on c.id = r.repair_access_order_id group by r.repair_access_order_id
    ), parts as (
      select p.order_id,
        coalesce(sum(p.installed_quantity * p.unit_cost) filter (where p.installed_quantity > 0 and p.unit_cost is not null), 0) as cost_known,
        coalesce(sum(p.installed_quantity) filter (where p.installed_quantity > 0), 0) as consumed_quantity,
        count(*) filter (where p.installed_quantity > 0) as consumed_lines,
        count(*) filter (where p.installed_quantity > 0 and p.unit_cost is null) as unknown_lines,
        bool_or(p.status not in ('cancelled', 'installed') and p.received_quantity < p.quantity) as blocked
      from public.repair_part_requests p join cohort c on c.id = p.order_id group by p.order_id
    ), third_parties as (
      select r.repair_access_order_id as order_id,
        coalesce(sum(r.actual_cost) filter (where r.actual_cost is not null), 0) as cost_known,
        count(*) filter (where r.actual_cost is null) as unknown_lines
      from public.repair_outsourcings r join cohort c on c.id = r.repair_access_order_id
      where r.status <> 'cancelado' group by r.repair_access_order_id
    ), linked_expenses as (
      select e.repair_order_id as order_id,
        coalesce(sum(e.amount) filter (where e.part_request_id is not null and e.impacts_cash), 0) as purchase_payments,
        coalesce(sum(e.amount) filter (where e.part_request_id is null), 0) as unclassified_expenses,
        count(*) filter (where e.part_request_id is null and e.amount <> 0) as unclassified_lines
      from public.expenses e join cohort c on c.id = e.repair_order_id
      where not coalesce(e.is_voided, false) group by e.repair_order_id
    ), enriched as materialized (
      select c.*,
        coalesce(c.approval_status = 'accepted' and d.decision = 'accepted', false) as accepted_current,
        coalesce(c.approval_status = 'rejected' and d.decision = 'rejected', false) as rejected_current,
        coalesce(c.final_amount, case when c.approval_status = 'accepted' and d.decision = 'accepted' then d.amount end, lp.amount) as charge_amount,
        coalesce(pay.collected, 0) as collected, coalesce(pay.payment_count, 0) as payment_count,
        coalesce(p.cost_known, 0) as parts_cost_known, coalesce(p.consumed_quantity, 0) as consumed_quantity,
        coalesce(t.cost_known, 0) as third_cost_known,
        coalesce(p.cost_known, 0) + coalesce(t.cost_known, 0) as direct_cost_known,
        (coalesce(p.unknown_lines, 0) > 0 or coalesce(t.unknown_lines, 0) > 0 or coalesce(e.unclassified_lines, 0) > 0
          or (nullif(btrim(c.used_parts), '') is not null and coalesce(p.consumed_lines, 0) = 0)
          or (c.import_source is not null and coalesce(p.consumed_lines, 0) = 0 and t.order_id is null)) as cost_incomplete,
        coalesce(e.purchase_payments, 0) as purchase_payments, coalesce(e.unclassified_expenses, 0) as unclassified_expenses,
        coalesce(p.blocked, false) as blocked_parts,
        (c.delivered_at is null and c.status <> 'retirado') as active_custody,
        case when c.delivered_at is null and c.status <> 'retirado' and c.intake_date <= v_today then v_today - c.intake_date end as intake_age_days
      from cohort c left join decisions d on d.id = c.id left join payments pay on pay.order_id = c.id
      left join legacy_prices lp on lp.order_id = c.id left join parts p on p.order_id = c.id
      left join third_parties t on t.order_id = c.id left join linked_expenses e on e.order_id = c.id
    ), technician_rows as (
      select e.technician_id as "technicianId", coalesce(p.full_name, case when e.technician_id is null then 'Sin tecnico asignado' else 'Tecnico sin perfil visible' end) as "technicianName",
        count(*) as orders, count(*) filter (where e.active_custody) as "activeCustody",
        count(*) filter (where e.created_by is not null and e.technician_id is not null and e.created_by <> e.technician_id) as "creatorDifferentOrders",
        count(*) filter (where e.accepted_current) as "acceptedCurrent", sum(e.collected) as collected,
        coalesce(sum(greatest(e.charge_amount - e.collected, 0)) filter (where e.charge_amount is not null), 0) as "knownDebtSubtotal",
        count(*) filter (where e.cost_incomplete) as "unknownCostOrders",
        case when bool_or(e.cost_incomplete) then null else sum(e.direct_cost_known) end as "directCost",
        sum(e.direct_cost_known) as "knownDirectCostSubtotal",
        sum(e.charge_amount - e.direct_cost_known) filter (where not e.cost_incomplete and e.charge_amount is not null) as "knownDirectMarginSubtotal",
        round((percentile_cont(0.5) within group (order by e.intake_age_days))::numeric, 2) as "intakeAgeMedianDays",
        round((percentile_cont(0.9) within group (order by e.intake_age_days))::numeric, 2) as "intakeAgeP90Days"
      from enriched e left join public.profiles p on p.id = e.technician_id group by e.technician_id, p.full_name
    )
    select jsonb_build_object(
      'from', v_from, 'to', v_to, 'asOf', v_today, 'snapshotAt', now(),
      'totals', (select jsonb_build_object(
        'orders', count(*), 'activeCustody', count(*) filter (where active_custody),
        'acceptedCurrent', count(*) filter (where accepted_current), 'rejectedCurrent', count(*) filter (where rejected_current),
        'staleAcceptanceOrders', count(*) filter (where approval_status = 'accepted' and not accepted_current),
        'acceptanceRate', round(100.0 * count(*) filter (where accepted_current) / nullif(count(*) filter (where accepted_current or rejected_current), 0), 2),
        'collected', coalesce(sum(collected), 0), 'knownChargeSubtotal', coalesce(sum(charge_amount), 0),
        'knownDebtSubtotal', coalesce(sum(greatest(charge_amount - collected, 0)) filter (where charge_amount is not null), 0),
        'debt', case when count(*) filter (where charge_amount is null) > 0 then null else coalesce(sum(greatest(charge_amount - collected, 0)), 0) end,
        'knownCreditSubtotal', coalesce(sum(greatest(collected - charge_amount, 0)) filter (where charge_amount is not null), 0),
        'unknownChargeOrders', count(*) filter (where charge_amount is null),
        'paidFlagWithoutPaymentsOrders', count(*) filter (where is_paid and payment_count = 0),
        'consumedPartsQuantity', coalesce(sum(consumed_quantity), 0), 'consumedPartsCostKnown', coalesce(sum(parts_cost_known), 0),
        'thirdPartyCostKnown', coalesce(sum(third_cost_known), 0), 'knownDirectCostSubtotal', coalesce(sum(direct_cost_known), 0),
        'unknownCostOrders', count(*) filter (where cost_incomplete),
        'directCost', case when count(*) filter (where cost_incomplete) > 0 then null else coalesce(sum(direct_cost_known), 0) end,
        'directMargin', case when count(*) filter (where cost_incomplete or charge_amount is null) > 0 then null else coalesce(sum(charge_amount - direct_cost_known), 0) end,
        'knownDirectMarginSubtotal', sum(charge_amount - direct_cost_known) filter (where not cost_incomplete and charge_amount is not null),
        'linkedPurchasePayments', coalesce(sum(purchase_payments), 0), 'unclassifiedRepExpenses', coalesce(sum(unclassified_expenses), 0),
        'warrantyOrders', count(*) filter (where has_warranty), 'activeWarrantyOrders', count(*) filter (where has_warranty and warranty_until >= v_today),
        'warrantyReviewOrders', count(*) filter (where warranty_requires_review),
        'intakeAgeMedianDays', round((percentile_cont(0.5) within group (order by intake_age_days))::numeric, 2),
        'intakeAgeP90Days', round((percentile_cont(0.9) within group (order by intake_age_days))::numeric, 2),
        'futureIntakeOrders', count(*) filter (where intake_date > v_today)
      ) from enriched),
      'categories', (select jsonb_build_object(
        'unassigned', count(*) filter (where technician_id is null and active_custody),
        'waiting_customer', count(*) filter (where status = 'presupuestado' and delivered_at is null),
        'parts', count(*) filter (where blocked_parts and active_custody),
        'ready', count(*) filter (where status = 'listo_para_retirar' and delivered_at is null),
        'return', count(*) filter (where status in ('sin_solucion', 'presupuestado_rechazado') and delivered_at is null)
      ) from enriched),
      'technicians', coalesce((select jsonb_agg(to_jsonb(t) order by "technicianName", "technicianId") from technician_rows t), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.get_workshop_business_report(date, date) from public, anon;
grant execute on function public.get_workshop_business_report(date, date) to authenticated;
comment on function public.get_workshop_business_report(date, date) is
  'Current state of orders in an intake-date cohort. Actual native and legacy payments once. Recorded direct costs, unknowns stay null. Intake age, not phase wait or net profit.';
commit;
