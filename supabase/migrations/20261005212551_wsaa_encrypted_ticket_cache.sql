-- Ciphertext only: encryption keys and WSAA token/sign never enter PostgreSQL.
begin;
create schema if not exists private;

create table private.wsaa_ticket_cache (
  environment text not null check (environment in ('homologation', 'production')),
  issuer_cuit text not null check (private.fiscal_valid_cuit(issuer_cuit)),
  certificate_fingerprint text not null check (certificate_fingerprint ~ '^[a-f0-9]{64}$'),
  service text not null check (service = 'wsfe'),
  encrypted_ticket text,
  expires_ms bigint,
  lease_token uuid,
  lease_until timestamptz,
  published_lease uuid,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (environment, issuer_cuit, certificate_fingerprint, service),
  check ((encrypted_ticket is null) = (expires_ms is null)),
  check ((lease_token is null) = (lease_until is null)),
  check (encrypted_ticket is null or (length(encrypted_ticket) <= 800000 and
    encrypted_ticket ~ '^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{22}==\.[A-Za-z0-9+/]+={0,2}$'))
);

alter table private.wsaa_ticket_cache enable row level security;
revoke all on private.wsaa_ticket_cache from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.wsaa_ticket_cache to service_role;

create function private.wsaa_ticket_validate_scope(p_input jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_input) is distinct from 'object'
    or coalesce(p_input->>'environment', '') not in ('homologation', 'production')
    or not coalesce(private.fiscal_valid_cuit(p_input->>'cuit'), false)
    or coalesce(p_input->>'fingerprint', '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_input->>'service', '') <> 'wsfe' then
    raise exception 'Invalid WSAA cache scope';
  end if;
end;
$$;

create function private.wsaa_ticket_claim(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row private.wsaa_ticket_cache;
  v_now timestamptz;
  v_now_ms bigint;
  v_token uuid;
begin
  perform private.wsaa_ticket_validate_scope(p_input);
  insert into private.wsaa_ticket_cache(environment, issuer_cuit, certificate_fingerprint, service)
    values (p_input->>'environment', p_input->>'cuit', p_input->>'fingerprint', p_input->>'service')
    on conflict do nothing;
  select * into v_row from private.wsaa_ticket_cache
    where environment = p_input->>'environment' and issuer_cuit = p_input->>'cuit'
      and certificate_fingerprint = p_input->>'fingerprint' and service = p_input->>'service'
    for update;
  v_now := clock_timestamp();
  v_now_ms := floor(extract(epoch from v_now) * 1000)::bigint;
  if v_row.expires_ms > v_now_ms then
    -- Do not request another TA during the final safety margin of a still-valid one.
    if v_row.expires_ms <= v_now_ms + 120000 then return jsonb_build_object('kind', 'busy'); end if;
    return jsonb_build_object('kind', 'cached', 'ciphertext', v_row.encrypted_ticket, 'expires', v_row.expires_ms);
  end if;
  if v_row.lease_until > v_now then return jsonb_build_object('kind', 'busy'); end if;
  v_token := gen_random_uuid();
  update private.wsaa_ticket_cache set lease_token = v_token,
    lease_until = v_now + interval '60 seconds', updated_at = v_now
    where environment = v_row.environment and issuer_cuit = v_row.issuer_cuit
      and certificate_fingerprint = v_row.certificate_fingerprint and service = v_row.service;
  return jsonb_build_object('kind', 'acquired', 'token', v_token);
end;
$$;

create function private.wsaa_ticket_publish(p_input jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_row private.wsaa_ticket_cache;
  v_token uuid;
  v_expires bigint;
  v_now_ms bigint;
begin
  perform private.wsaa_ticket_validate_scope(p_input);
  v_token := (p_input->>'token')::uuid;
  v_expires := (p_input->>'expires')::bigint;
  v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  if v_token is null or v_expires is null or v_expires <= v_now_ms + 120000 or v_expires > v_now_ms + 86400000
    or coalesce(p_input->>'ciphertext', '') !~ '^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{22}==\.[A-Za-z0-9+/]+={0,2}$'
    or length(p_input->>'ciphertext') > 800000 then raise exception 'Invalid encrypted WSAA ticket'; end if;
  select * into v_row from private.wsaa_ticket_cache
    where environment = p_input->>'environment' and issuer_cuit = p_input->>'cuit'
      and certificate_fingerprint = p_input->>'fingerprint' and service = p_input->>'service'
    for update;
  if not found then return false; end if;
  if v_row.lease_token is null and v_row.published_lease = v_token
    and v_row.encrypted_ticket = p_input->>'ciphertext' and v_row.expires_ms = v_expires then return true; end if;
  -- Fencing token, not just a timestamp: a superseded worker cannot publish.
  if v_row.lease_token is distinct from v_token then return false; end if;
  update private.wsaa_ticket_cache set encrypted_ticket = p_input->>'ciphertext', expires_ms = v_expires,
    lease_token = null, lease_until = null, published_lease = v_token, updated_at = clock_timestamp()
    where environment = v_row.environment and issuer_cuit = v_row.issuer_cuit
      and certificate_fingerprint = v_row.certificate_fingerprint and service = v_row.service;
  return true;
end;
$$;

create function private.wsaa_ticket_release(p_input jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform private.wsaa_ticket_validate_scope(p_input);
  update private.wsaa_ticket_cache set lease_token = null, lease_until = null, updated_at = clock_timestamp()
    where environment = p_input->>'environment' and issuer_cuit = p_input->>'cuit'
      and certificate_fingerprint = p_input->>'fingerprint' and service = p_input->>'service'
      and lease_token = (p_input->>'token')::uuid;
  return found;
end;
$$;

create function public.wsaa_ticket_claim(p_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select private.wsaa_ticket_claim(p_input) $$;
create function public.wsaa_ticket_publish(p_input jsonb)
returns boolean language sql security invoker set search_path = '' as $$ select private.wsaa_ticket_publish(p_input) $$;
create function public.wsaa_ticket_release(p_input jsonb)
returns boolean language sql security invoker set search_path = '' as $$ select private.wsaa_ticket_release(p_input) $$;

revoke all on function private.wsaa_ticket_validate_scope(jsonb), private.wsaa_ticket_claim(jsonb),
  private.wsaa_ticket_publish(jsonb), private.wsaa_ticket_release(jsonb), public.wsaa_ticket_claim(jsonb),
  public.wsaa_ticket_publish(jsonb), public.wsaa_ticket_release(jsonb) from public, anon, authenticated;
grant execute on function private.wsaa_ticket_validate_scope(jsonb), private.wsaa_ticket_claim(jsonb),
  private.wsaa_ticket_publish(jsonb), private.wsaa_ticket_release(jsonb), public.wsaa_ticket_claim(jsonb),
  public.wsaa_ticket_publish(jsonb), public.wsaa_ticket_release(jsonb) to service_role;
commit;
