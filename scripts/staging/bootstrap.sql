-- STAGING ONLY. This file is not an application migration.
begin;
do $$ begin
  if current_database() <> 'chetech_staging' or current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'Refusing a non-staging database';
  end if;
  if not exists (select 1 from pg_roles where rolname='chetech_staging_authenticator') then
    create role chetech_staging_authenticator login noinherit nosuperuser nocreatedb nocreaterole nobypassrls
      password 'chetech-local-rest-only-20261005';
  end if;
  if exists (select 1 from pg_roles where rolname='chetech_staging_authenticator'
    and (rolsuper or rolcreatedb or rolcreaterole or rolbypassrls or rolinherit)) then
    raise exception 'Unsafe staging authenticator privileges';
  end if;
  if exists (select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    join pg_roles member_role on member_role.oid=m.member
    where member_role.rolname='chetech_staging_authenticator' and r.rolname not in ('anon','authenticated')) then
    raise exception 'Unexpected staging authenticator role membership';
  end if;
end $$;
grant anon, authenticated to chetech_staging_authenticator;
grant connect on database chetech_staging to chetech_staging_authenticator;
-- The reconstructed local roles need sequence usage for existing invoker RPCs.
grant usage, select on all sequences in schema public to authenticated;

-- Minimal local Storage catalog compatibility; no production Storage connection.
alter table if exists storage.buckets add column if not exists file_size_limit bigint;
alter table if exists storage.buckets add column if not exists allowed_mime_types text[];

-- PostgREST supplies request.jwt.claims; support the parent's legacy SQL tests too.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid
$$;
notify pgrst, 'reload schema';
commit;
