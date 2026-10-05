create index if not exists salary_liquidations_created_by_idx
  on public.salary_liquidations (created_by);

create index if not exists salary_withdrawals_member_id_idx
  on public.salary_withdrawals (member_id);

create index if not exists salary_withdrawals_liquidation_id_idx
  on public.salary_withdrawals (liquidation_id);

create index if not exists replenishment_plan_product_id_idx
  on public.replenishment_plan_items (product_id);

create index if not exists replenishment_plan_updated_by_idx
  on public.replenishment_plan_items (updated_by);
