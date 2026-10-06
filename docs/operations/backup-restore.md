# Backup and Recovery Runbook

## Three Different Artifacts

| Artifact | Purpose | Not Included |
| --- | --- | --- |
| `/api/backup` or `?format=xlsx` | Compatible seven-sheet operational Excel export, plus an Alcance sheet | Most operational modules, auth, Storage, DDL and private schemas |
| `/api/backup?format=json` or private CLI | Paginated application data from the public operational table inventory, all columns/IDs and module provenance | Auth/sessions, Storage metadata/object bytes, private schemas, DDL, policies, grants, functions, triggers, indexes, sequences and project configuration |
| PostgreSQL custom archive + roles + independent Storage copy | Technical recovery foundation, subject to privileges, compatible extensions and a proven restore | Storage bytes and external/project secrets; roles require separate handling |

**JSON is not a full PostgreSQL backup and cannot reconstruct the database, auth or Storage.** It is a private, inspectable application-data artifact. Do not replay its rows through business actions: triggers can duplicate cash/stock effects. Use PostgreSQL recovery for a real restore.

Supabase's database backup contains Storage metadata, not the stored object bytes. Back up/download object bytes separately with an access-controlled inventory containing bucket, path, size and checksum. Record project configuration and secrets in a separate protected recovery vault, not in this repository. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

## Private Operational Export

Run from the isolated worktree. Node >=20.12 and existing dependencies are required; no new dependency or root script is introduced. Supply the ORIGINAL env file explicitly. The CLI opens it read-only and does not load unrelated values into process.env or log credentials. Production access is SELECT-only via the service role; there is no import/deploy path in this command.

```powershell
node_modules/.bin/tsx.cmd scripts/backup-export.ts --env-path "C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\.env.local" --out-dir tmp/backups/application --page-size 500
```

Output must be under ignored `tmp/backups`; the CLI verifies this with git before querying. Files use exclusive creation, a unique timestamp/name and restrictive POSIX modes. On Windows, also confirm the directory's ACL grants only the operator, Administrators and SYSTEM. Git ignore is not encryption. Keep artifacts off shared/cloud-synced folders, screenshots, logs, Sites, previews and chat attachments. Encrypt retained copies and define retention with the owner.

The command prints only artifact paths/counts. A valid pair is `operational-<timestamp>-<id>.json` and its `.manifest.json` sidecar. Treat an interrupted/unpaired file as unverified. Use the exact emitted filename:

```powershell
node_modules/.bin/tsx.cmd scripts/verify-backup.ts --file "tmp/backups/application/operational-<timestamp>-<id>.json"
```

The embedded manifest records start/end time, source revision (including dirty-workspace status), public schema, module/table/identity provenance, availability, exact row counts, total rows and SHA-256 per table. The sidecar adds byte length and file SHA-256. Canonical key sorting makes table checksums independent of JSON object key order. These hashes detect damage, not malicious replacement; store a trusted/encrypted external copy of the checksum/manifest.

Pagination advances by the actual returned row count and does not stop on a short server-capped page. Identity order is stable; duplicates, changing counts, denied/missing required tables and unexpected truncation fail the export. Release tables absent with 42P01/PGRST205 are explicitly `not-deployed`, never silently reported as exported-empty. A stale API schema cache can produce the same missing-table response: investigate before accepting a post-release artifact. A schema-coverage regression test requires every new checked-in public table to be added to the inventory.

Older version-1 artifacts remain verifiable when later optional release tables were not yet in their manifest. Required baseline tables cannot be omitted; unknown future table inventories require a compatible verifier update. Preserve the matching verifier/release alongside archived artifacts.

REST reads are **non-transactional**. Count checks do not detect same-count updates or every cross-table race. Export in a quiet operational window; use a single PostgreSQL snapshot/dump for consistent recovery. Large exports run better through the private CLI than an HTTP function's memory/time limits. API authorization remains requireAdmin with private/no-store headers. The JSON path does not import xlsx. The Excel writer was retained by this block; the parent has since coordinated a shared dependency change to SheetJS 0.20.3. Dependency security/release approval remains a separate gate, not a claim made by this backup implementation.

The comprehensive JSON API additionally requires the existing server-only SUPABASE_SERVICE_ROLE_KEY and URL after requireAdmin succeeds. It uses no cookie sessions in its export client and never returns the key. Missing service credentials return 503 without a partial export. This is necessary for protected fiscal tables/counters whose full columns are not granted to authenticated sessions. Excel retains its previous session client. Fiscal counters use their full composite identity (environment, issuer_cuit, point_of_sale, voucher_type), not a fabricated id. Treat active fiscal claim/lease fields in private JSON as sensitive operational control data.

### HTTP JSON Size Guard

The HTTP JSON download is limited to **4 MiB (4,194,304 UTF-8 bytes)** of the complete serialized artifact, including its manifest. The exact boundary is accepted. Any larger artifact returns **413** with a friendly instruction to use `scripts/backup-export.ts` with explicit `--env-path` and `--out-dir tmp/backups/application`. The error is private/no-store, has no download attachment and contains no exported rows, credentials or partial manifest. No tables/history are truncated, and no partial JSON backup is advertised as successful.

This threshold leaves margin below Vercel's documented function response-body limit. It is a transport guard, not a guarantee against function memory/time limits while reading a growing export. Prefer the private CLI for comprehensive or recurring exports. The CLI remains unrestricted by this HTTP-only byte cap, writes the complete plain JSON plus sidecar, and uses the existing verification/restore workflow; no gzip format or parser change was introduced. [Vercel function limitations](https://vercel.com/docs/functions/limitations#request-body-size).

## Real PostgreSQL Dump and Restore

Host `pg_dump`, `pg_dumpall`, `pg_restore` and `psql` were not on PATH during this work. Docker is available; the parent owns schema reconstruction and dump/restore in PostgreSQL 17 staging on **127.0.0.1:54339**. Missing binaries do not justify substituting JSON for a backup. Use a matching PostgreSQL client/container and a role able to read every required schema/object. Check client/server versions first. A dump client cannot dump a newer-major server. [Official pg_dump documentation](https://www.postgresql.org/docs/current/app-pgdump.html).

For native clients, use a private libpq service file/passfile and `PGSERVICE`, never a password-bearing connection URL in a command, terminal history or committed file. The source service must target the read-only source connection. Choose a private output folder such as the ignored workspace folder after checking its ACL. Execute each command separately and require exit code 0:

```powershell
$env:PGSERVICE = "chetech_backup_source"
pg_dump --version
pg_restore --version
psql -X --no-password --tuples-only --command "show server_version;"
pg_dump --no-password --format=custom --file=tmp/backups/database.dump
pg_dumpall --no-password --roles-only --no-role-passwords --file=tmp/backups/roles.sql
pg_restore --list tmp/backups/database.dump
Get-FileHash -Algorithm SHA256 tmp/backups/database.dump
Get-FileHash -Algorithm SHA256 tmp/backups/roles.sql
```

The archive must not be restricted to `public` if recovering auth/private/storage metadata is required. Confirm actual schemas/tables/functions/policies/sequence states in the archive. pg_dump is one database, not every cluster global. Roles/passwords, managed extensions, ownership, ACLs and Supabase-specific auth/storage setup need an explicit compatible destination contract. Review roles.sql before any restore; do not blindly overwrite platform roles. [Official pg_dumpall documentation](https://www.postgresql.org/docs/current/app-pg-dumpall.html).

If using Docker, run client commands INSIDE the staging/client container and use `docker cp` to copy binary archives into the private folder. Avoid piping binary pg_dump output through Windows PowerShell text redirection. Never use production credentials as the restore target. Schema-only reconstruction plus synthetic seeds is a test fixture, not a full production-data backup.

Restore only into a fresh, disposable database with compatible Supabase roles/extensions/schema prerequisites. Provision its roles under parent control first. A dedicated private `chetech_restore_isolated` service must point to the disposable target, not the source. Verify its identity, host/port and absence of application connections before executing:

```powershell
$env:PGSERVICE = "chetech_restore_isolated"
psql -X --no-password --tuples-only --command "select current_database(), inet_server_addr(), inet_server_port();"
pg_restore --no-password --exit-on-error --single-transaction --dbname=chetech_restore_isolated tmp/backups/database.dump
```

Do not add `--clean`, `--create`, `--no-owner` or `--no-acl` casually. Cleaning is destructive; dropping ownership/ACLs prevents this from proving authorization recovery. If platform ownership requires a controlled adaptation, document the differences and separately verify policies/grants. A single-transaction restore is atomic and exits on error; do not claim success from archive listing alone. [Official pg_restore documentation](https://www.postgresql.org/docs/current/app-pgrestore.html).

## Read-Only Staging Verification

The CLI verifier accepts only localhost/127.0.0.1 **port 54339**, uses a repeatable-read read-only transaction, and never changes data. Put the private connection in `BACKUP_VERIFY_DATABASE_URL` through the operator's secret environment. Do not print it.

```powershell
node_modules/.bin/tsx.cmd scripts/verify-backup-restore.ts --file "tmp/backups/application/operational-<timestamp>-<id>.json" --mode schema
node_modules/.bin/tsx.cmd scripts/verify-backup-restore.ts --file "tmp/backups/application/operational-<timestamp>-<id>.json" --mode exact
```

`schema` verifies required tables and exported columns exist in the prepared destination. It is not a data restore proof. `exact` additionally checks restored rows/counts/table checksums against the artifact, selecting exported columns so additive destination columns do not create false mismatches. It requires the artifact's actual data already restored by the parent. Synthetic seed data will intentionally fail exact comparison with a production-data artifact. Undeployed optional tables are skipped with explicit manifest provenance.

Exact verification also checks identity sets and covered foreign keys (including the minimal auth.users ID scaffold). The PostgreSQL metadata reader casts name arrays to text arrays for node-pg decoding. It reports zero writes and never prints private rows.

Neither mode verifies auth login, Storage bytes, grants, sequences or full PostgreSQL recovery. After a real archive restore, separately demonstrate: a known REP/customer/device, linked parts and decisions, event history, invoice items/payments/PDF, balances, stock/reservations, roles/RLS denials and sequence-safe next IDs. Restore Storage bytes separately and open sample attachments. Record archive hashes, versions, elapsed recovery time, results and remaining gaps without private row contents. Keep recoverability/release status **unverified** until that rehearsal passes.

## Actual Disposable Application Restore

`scripts/backup-restore-local.ts` is an explicitly local data-recovery rehearsal, not a production restore tool. The operator supplies BACKUP_RESTORE_DATABASE_URL privately with localhost/127.0.0.1, port 54339 and database `chetech_restore_YYYYMMDD` (optional test suffix). Routing query options/fragments are rejected so node-pg cannot override the validated host. The fixed Docker container must bind PostgreSQL on 127.0.0.1:54339. A normal run refuses any existing destination database, never drops/replaces a database, and reads only the schema from chetech_staging.

Run with Node 24 and the existing tsx loader after loading the connection from the operator's private environment:

```powershell
node --import tsx scripts/backup-restore-local.ts --file tmp/backups/application/operational-2026-10-05T20-16-26-383Z-94b915d0.json
node --import tsx scripts/verify-backup-restore.ts --file tmp/backups/application/operational-2026-10-05T20-16-26-383Z-94b915d0.json --mode exact
```

The second command uses BACKUP_VERIFY_DATABASE_URL targeting the same disposable database. Do not put credentials in command-line arguments. The launcher used for the recorded rehearsal was the bundled Node 24.19.0 executable, not the system Node 20 executable.

The restore creates a new database, obtains a custom `pg_dump --schema-only` archive from current chetech_staging and restores it with pg_restore --single-transaction. Docker database clients use the explicit local /var/run/postgresql socket and port 5432 so inherited PGHOST/PGPORT cannot redirect them. Extra/public PostgreSQL port bindings are rejected. It does not execute the broken raw schema snapshot or alter chetech_staging. The schema/roles/extensions must already be reconstructable in that local cluster; JSON supplies data only.

Public rows are inserted in bound JSON batches with their historical IDs/columns unchanged. Seven auth.users ID placeholders were derived from profiles; no password/email/session credentials were reconstructed. Import uses SET LOCAL session_replication_role=replica only in the disposable transaction, then resets origin before verification. This skips historical numbering/business triggers but also bypasses FK triggers, so all covered FK relations are explicitly checked for orphan rows before commit. PostgreSQL documents this FK consequence. [PostgreSQL replication-role documentation](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-SESSION-REPLICATION-ROLE).

Import checks every public/private/auth table is empty first, rejects always-enabled triggers needing review, checks IDs/counts/content checksums, and rolls back failures. `--resume-empty` is allowed only for an empty disposable destination with exactly one private schema archive from the initial attempt; it does not reload/drop the schema or delete rows. A populated or successfully restored database cannot be replayed or replaced.

Recorded result on 2026-10-05: chetech_restore_20261005 contains **40 exported operational tables, 8,221 rows, exact identity sets/counts/SHA-256 checksums, 68 checked foreign keys and zero orphans**. An independent read-only exact verification passed after commit. chetech_staging was retained. The verified report is `tmp/backups/local-restore/chetech_restore_20261005/verified-6684543f-c511-4ed5-a1e0-2de35fa53de6.json`; its schema archive and application hash are recorded there. Both are ignored private artifacts.

The first attempt rolled back after a PostgreSQL name-array metadata decoding error; the fix and guarded empty resume were tested before completion. The successful result proves application-row recovery against the provided schema, **not** full PostgreSQL/auth/Storage/project recovery. Original sequence states are not in JSON. The database contains private historical data and must never be connected to a public preview or used for visual screenshots. Keep it local and access-controlled until the parent records/archives the rehearsal under the retention policy.
