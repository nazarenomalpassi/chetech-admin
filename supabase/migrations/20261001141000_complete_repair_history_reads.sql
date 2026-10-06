-- Keep the deployed technician payload and permission guard unchanged.
-- PostgREST ranges now bound each response instead of truncating the history.
do $$
declare
  v_definition text;
  v_old_limit text := 'limit case when p_order_id is null then 500 else 1 end;';
  v_new_limit text := 'limit case when p_order_id is null then null else 1 end;';
begin
  select pg_get_functiondef('public.get_technician_repair_orders(uuid)'::regprocedure)
  into v_definition;
  if position(v_new_limit in v_definition) > 0 then
    return;
  end if;
  if position(v_old_limit in v_definition) = 0 then
    raise exception 'Unexpected technician order function definition; no changes applied';
  end if;
  execute replace(v_definition, v_old_limit, v_new_limit);
end;
$$;
