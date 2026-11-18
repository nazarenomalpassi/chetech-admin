#!/usr/bin/env bash
# Copia CheTech de Supabase a la base de Railway: esquema y datos de la aplicación, usuarios
# (con sus contraseñas), buckets, reglas de archivos y los archivos mismos.
#
# Se puede repetir: antes de copiar deja la base de Railway como recién creada. Supabase solo
# se lee; nunca se modifica.
#
# Variables (en el servicio de Railway; las de origen las carga el dueño, nunca por chat):
#   SOURCE_DATABASE_URL   conexión "Session pooler" de Supabase
#   SOURCE_SECRET_KEY     clave secreta (service_role o sb_secret_) de Supabase, para bajar archivos
#   SOURCE_SUPABASE_URL   https://<ref>.supabase.co
#   TARGET_DATABASE_URL   referencia a Postgres de Railway (superusuario)
#   S3_ENDPOINT S3_BUCKET S3_REGION S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY  bucket de Railway
#   STORAGE_TENANT_ID     el TENANT_ID del servicio de archivos
#   MIGRATE_MODE          "check" solo prueba las conexiones y cuenta filas; por defecto copia
set -Eeuo pipefail

: "${SOURCE_DATABASE_URL:?Falta SOURCE_DATABASE_URL}"
: "${SOURCE_SECRET_KEY:?Falta SOURCE_SECRET_KEY}"
: "${SOURCE_SUPABASE_URL:?Falta SOURCE_SUPABASE_URL}"
: "${TARGET_DATABASE_URL:?Falta TARGET_DATABASE_URL}"
: "${S3_ENDPOINT:?Falta S3_ENDPOINT}" "${S3_BUCKET:?Falta S3_BUCKET}" "${S3_REGION:?Falta S3_REGION}"
: "${S3_ACCESS_KEY_ID:?Falta S3_ACCESS_KEY_ID}" "${S3_SECRET_ACCESS_KEY:?Falta S3_SECRET_ACCESS_KEY}"
: "${STORAGE_TENANT_ID:?Falta STORAGE_TENANT_ID}"
MODE="${MIGRATE_MODE:-run}"

APP_SCHEMAS=(public private document_access)
WORK=/tmp/migration
mkdir -p "$WORK"
cd "$WORK"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
trap 'log "ERROR en la línea $LINENO; la base de Railway puede quedar a medias. Supabase no se tocó."' ERR

src() { psql "$SOURCE_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
dst() { psql "$TARGET_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

schema_args=()
for schema in "${APP_SCHEMAS[@]}"; do schema_args+=(-n "$schema"); done
schema_list=$(printf "'%s'," "${APP_SCHEMAS[@]}")
schema_list="${schema_list%,}"

count_rows() {
  # Cuenta exacta por tabla de la aplicación, más usuarios y archivos.
  "$1" -tA -F '|' -c "
    select format('%s.%s', n.nspname, c.relname),
           (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ($schema_list)
    union all select 'auth.users', count(*)::text from auth.users
    union all select 'auth.identities', count(*)::text from auth.identities
    union all select 'storage.buckets', count(*)::text from storage.buckets
    union all select 'storage.objects', count(*)::text from storage.objects
    order by 1"
}

log "Probando conexiones"
src -tAc "select 'origen: ' || version()"
dst -tAc "select 'destino: ' || version()"

if [[ "$MODE" == "check" ]]; then
  count_rows src > counts-source.txt
  log "Filas en Supabase:"
  cat counts-source.txt
  log "Modo check: no se copió nada."
  exit 0
fi

log "1/7 Roles que faltan en Railway"
src -tAc "select rolname from pg_roles where rolname !~ '^pg_' order by 1" > roles.txt
while read -r role; do
  [[ -z "$role" ]] && continue
  dst -c "do \$\$ begin
    if not exists (select from pg_roles where rolname = '${role//\'/\'\'}') then
      execute format('create role %I nologin', '${role//\'/\'\'}');
    end if; end \$\$;"
done < roles.txt

log "2/7 Dejando la base de Railway limpia"
dst <<'SQL'
set session_replication_role = replica;
drop schema if exists document_access cascade;
drop schema if exists private cascade;
drop schema if exists public cascade;
create schema public;
alter schema public owner to pg_database_owner;
grant usage on schema public to postgres, anon, authenticated, service_role;
delete from storage.objects;
delete from storage.buckets;
-- Los usuarios se borran con los disparadores activos para que se vayan también sus sesiones.
set session_replication_role = origin;
delete from auth.users;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_net with schema extensions;
SQL

log "3/7 Esquema de la aplicación"
pg_dump "$SOURCE_DATABASE_URL" --schema-only --quote-all-identifiers --no-publications \
  --no-subscriptions "${schema_args[@]}" > schema.raw.sql
sed -E \
  -e 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
  -e 's/^(ALTER PUBLICATION|CREATE PUBLICATION|CREATE EVENT TRIGGER|ALTER EVENT TRIGGER)/-- &/' \
  schema.raw.sql > schema.sql
dst -1 -f schema.sql

log "4/7 Datos de la aplicación"
pg_dump "$SOURCE_DATABASE_URL" --data-only --quote-all-identifiers "${schema_args[@]}" > data.sql
{ echo "set session_replication_role = replica;"; cat data.sql; } > data.load.sql
dst -1 -f data.load.sql

copy_common_columns() {
  # Copia solo las columnas que existen en las dos versiones (Supabase y Railway pueden diferir).
  local table="$1" file
  file="$(echo "$table" | tr '.' '_').csv"
  local query="select string_agg(quote_ident(column_name), ',' order by column_name)
    from information_schema.columns
    where table_schema = split_part('$table', '.', 1) and table_name = split_part('$table', '.', 2)
      and is_generated = 'NEVER' and generation_expression is null"
  local source_columns target_columns columns
  source_columns=$(src -tAc "$query" | tr ',' '\n' | sort)
  target_columns=$(dst -tAc "$query" | tr ',' '\n' | sort)
  columns=$(comm -12 <(echo "$source_columns") <(echo "$target_columns") | paste -sd, -)
  src -c "\\copy (select $columns from $table) to '$WORK/$file' with (format csv)"
  dst <<SQL
set session_replication_role = replica;
\\copy $table ($columns) from '$WORK/$file' with (format csv)
SQL
  log "   $table: $(wc -l < "$file") filas"
}

log "5/7 Usuarios, buckets y registros de archivos"
copy_common_columns auth.users
copy_common_columns auth.identities
copy_common_columns storage.buckets
copy_common_columns storage.objects

log "   Disparadores sobre usuarios y reglas de archivos"
src -tA -c "
  select pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal and n.nspname in ('auth','storage') and pn.nspname in ($schema_list)
  union all
  select format('drop policy if exists %I on %I.%I; create policy %I on %I.%I as %s for %s to %s%s%s;',
    policyname, schemaname, tablename, policyname, schemaname, tablename, permissive, cmd,
    (select string_agg(quote_ident(r), ', ') from unnest(roles) r),
    case when qual is not null then ' using (' || qual || ')' else '' end,
    case when with_check is not null then ' with check (' || with_check || ')' else '' end)
  from pg_policies where schemaname = 'storage'" > auth-storage.sql
dst -1 -f auth-storage.sql
log "   $(grep -c . auth-storage.sql) disparadores y reglas"

log "6/7 Archivos"
src -tA -F $'\t' -c "
  select bucket_id, name, coalesce(version, ''), coalesce(metadata->>'mimetype', 'application/octet-stream')
  from storage.objects order by bucket_id, name" > objects.tsv
endpoint="${S3_ENDPOINT%/}"
copied=0
failed=0
while IFS=$'\t' read -r bucket name version mimetype; do
  [[ -z "$bucket" ]] && continue
  encoded=$(jq -rn --arg s "$name" '$s | split("/") | map(@uri) | join("/")')
  headers=(-H "apikey: $SOURCE_SECRET_KEY")
  [[ "$SOURCE_SECRET_KEY" == eyJ* ]] && headers+=(-H "Authorization: Bearer $SOURCE_SECRET_KEY")
  if ! curl -fsS --retry 3 "${headers[@]}" -o "$WORK/object.bin" \
      "${SOURCE_SUPABASE_URL%/}/storage/v1/object/$bucket/$encoded"; then
    failed=$((failed + 1)); log "   no se pudo bajar $bucket/$name"; continue
  fi
  key="$STORAGE_TENANT_ID/$bucket/$encoded"
  [[ -n "$version" ]] && key="$key/$version"
  if ! curl -fsS --retry 3 --aws-sigv4 "aws:amz:$S3_REGION:s3" \
      --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -H "Content-Type: $mimetype" \
      -T "$WORK/object.bin" "$endpoint/$S3_BUCKET/$key" -o /dev/null; then
    failed=$((failed + 1)); log "   no se pudo subir $bucket/$name"; continue
  fi
  copied=$((copied + 1))
done < objects.tsv
log "   archivos copiados: $copied, con error: $failed"

log "7/7 Verificación"
dst -c "analyze; notify pgrst, 'reload schema';"
count_rows src > counts-source.txt
count_rows dst > counts-target.txt
if diff -u counts-source.txt counts-target.txt; then
  log "Todas las tablas tienen la misma cantidad de filas ($(wc -l < counts-source.txt) tablas)."
else
  log "Hay diferencias de filas (arriba). Revisar antes del corte."
  exit 1
fi
if (( failed > 0 )); then
  log "Fallaron $failed archivos. Revisar antes del corte."
  exit 1
fi
log "Migración completa."
