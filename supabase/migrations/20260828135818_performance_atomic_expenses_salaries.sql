-- Atomic write paths remove network waterfalls and keep records, cash, and audit in sync.

create or replace function public.save_expense_atomic(
  p_expense_id uuid,
  p_expense_date date,
  p_type text,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_observations text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_expense_id uuid := p_expense_id;
  v_method text;
  v_action text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede gestionar gastos.' using errcode = '42501';
  end if;

  if p_expense_date is null or nullif(btrim(p_type), '') is null
     or nullif(btrim(p_description), '') is null or coalesce(p_amount, 0) <= 0 then
    raise exception 'Revisa los datos del gasto.' using errcode = '22023';
  end if;

  v_method := case
    when lower(btrim(p_payment_method)) like '%efectivo%' then 'efectivo'
    when lower(btrim(p_payment_method)) = 'mp'
      or lower(btrim(p_payment_method)) like '%nx local%'
      or lower(btrim(p_payment_method)) like '%mercado%'
      or lower(btrim(p_payment_method)) like '%local%' then 'mp'
    when lower(btrim(p_payment_method)) like '%nx%' then 'nx'
    else null
  end;

  if v_method is null then
    raise exception 'Selecciona un medio de pago valido.' using errcode = '22023';
  end if;

  if v_expense_id is null then
    v_action := 'insert';
    insert into public.expenses (
      expense_date,
      type,
      description,
      amount,
      payment_method,
      impacts_cash,
      observations,
      created_by
    )
    values (
      p_expense_date,
      p_type,
      p_description,
      p_amount,
      v_method,
      true,
      nullif(p_observations, ''),
      v_user_id
    )
    returning id into v_expense_id;
  else
    v_action := 'update';
    update public.expenses
    set
      expense_date = p_expense_date,
      type = p_type,
      description = p_description,
      amount = p_amount,
      payment_method = v_method,
      impacts_cash = true,
      observations = nullif(p_observations, ''),
      created_by = v_user_id
    where id = v_expense_id;

    if not found then
      raise exception 'No se encontro el gasto seleccionado.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.movimientos_caja
  where referencia_tabla = 'expenses' and referencia_id = v_expense_id;

  insert into public.movimientos_caja (
    tipo,
    monto,
    medio_pago,
    descripcion,
    referencia_tabla,
    referencia_id,
    created_by,
    fecha
  )
  values (
    'gasto',
    p_amount,
    v_method,
    p_description,
    'expenses',
    v_expense_id,
    v_user_id,
    p_expense_date::timestamp at time zone 'America/Argentina/Buenos_Aires'
  );

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'expenses',
    v_expense_id::text,
    v_action,
    jsonb_build_object(
      'expense_date', p_expense_date,
      'type', p_type,
      'description', p_description,
      'amount', p_amount,
      'payment_method', v_method,
      'impacts_cash', true,
      'observations', nullif(p_observations, '')
    ),
    v_user_id
  );

  return jsonb_build_object('id', v_expense_id, 'action', v_action);
end;
$$;

revoke all on function public.save_expense_atomic(uuid, date, text, text, numeric, text, text) from public, anon;
grant execute on function public.save_expense_atomic(uuid, date, text, text, numeric, text, text) to authenticated, service_role;

create or replace function public.delete_expense_atomic(p_expense_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede eliminar gastos.' using errcode = '42501';
  end if;

  perform 1 from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'No se encontro el gasto seleccionado.' using errcode = 'P0002';
  end if;

  delete from public.movimientos_caja
  where referencia_tabla = 'expenses' and referencia_id = p_expense_id;
  delete from public.expenses where id = p_expense_id;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values ('expenses', p_expense_id::text, 'delete', '{}'::jsonb, v_user_id);

  return jsonb_build_object('id', p_expense_id);
end;
$$;

revoke all on function public.delete_expense_atomic(uuid) from public, anon;
grant execute on function public.delete_expense_atomic(uuid) to authenticated, service_role;

create or replace function public.save_salary_withdrawal_atomic(
  p_withdrawal_id uuid,
  p_withdrawal_date date,
  p_amount numeric,
  p_payment_method text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_withdrawal_id uuid := p_withdrawal_id;
  v_method text;
  v_action text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede gestionar retiros de sueldo.' using errcode = '42501';
  end if;

  if p_withdrawal_date is null or coalesce(p_amount, 0) <= 0 then
    raise exception 'Revisa los datos del retiro.' using errcode = '22023';
  end if;

  v_method := case
    when lower(btrim(p_payment_method)) = 'efectivo' then 'efectivo'
    when lower(btrim(p_payment_method)) = 'mp' then 'mp'
    when lower(btrim(p_payment_method)) = 'nx' then 'nx'
    else null
  end;

  if v_method is null then
    raise exception 'Selecciona una cuenta de salida valida.' using errcode = '22023';
  end if;

  if v_withdrawal_id is null then
    v_action := 'insert';
    insert into public.salary_withdrawals (
      withdrawal_date,
      amount,
      payment_method,
      notes,
      created_by
    )
    values (
      p_withdrawal_date,
      p_amount,
      v_method,
      nullif(p_notes, ''),
      v_user_id
    )
    returning id into v_withdrawal_id;
  else
    v_action := 'update';
    update public.salary_withdrawals
    set
      withdrawal_date = p_withdrawal_date,
      amount = p_amount,
      payment_method = v_method,
      notes = nullif(p_notes, ''),
      created_by = v_user_id
    where id = v_withdrawal_id;

    if not found then
      raise exception 'No se encontro el retiro seleccionado.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.movimientos_caja
  where referencia_tabla = 'salary_withdrawals' and referencia_id = v_withdrawal_id;

  insert into public.movimientos_caja (
    tipo,
    monto,
    medio_pago,
    descripcion,
    referencia_tabla,
    referencia_id,
    created_by
  )
  values (
    'sueldo',
    p_amount,
    v_method,
    'Retiro de sueldo ' || p_withdrawal_date::text,
    'salary_withdrawals',
    v_withdrawal_id,
    v_user_id
  );

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values (
    'salary_withdrawals',
    v_withdrawal_id::text,
    v_action,
    jsonb_build_object(
      'withdrawal_date', p_withdrawal_date,
      'amount', p_amount,
      'payment_method', v_method,
      'notes', nullif(p_notes, '')
    ),
    v_user_id
  );

  return jsonb_build_object('id', v_withdrawal_id, 'action', v_action);
end;
$$;

revoke all on function public.save_salary_withdrawal_atomic(uuid, date, numeric, text, text) from public, anon;
grant execute on function public.save_salary_withdrawal_atomic(uuid, date, numeric, text, text) to authenticated, service_role;

create or replace function public.delete_salary_withdrawal_atomic(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'La sesion vencio. Inicia sesion nuevamente.' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede eliminar retiros de sueldo.' using errcode = '42501';
  end if;

  perform 1 from public.salary_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'No se encontro el retiro seleccionado.' using errcode = 'P0002';
  end if;

  delete from public.movimientos_caja
  where referencia_tabla = 'salary_withdrawals' and referencia_id = p_withdrawal_id;
  delete from public.salary_withdrawals where id = p_withdrawal_id;

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values ('salary_withdrawals', p_withdrawal_id::text, 'delete', '{}'::jsonb, v_user_id);

  return jsonb_build_object('id', p_withdrawal_id);
end;
$$;

revoke all on function public.delete_salary_withdrawal_atomic(uuid) from public, anon;
grant execute on function public.delete_salary_withdrawal_atomic(uuid) to authenticated, service_role;
