# Isolated Local Staging

## Implementation Plan

Goal: run the unchanged Next.js app against synthetic Auth and real PostgreSQL RLS/RPCs.

Architecture: the prepared PostgreSQL 17 container remains the only database. An
official, version-pinned PostgREST container uses a dedicated non-superuser login.
A small Node HTTP server supplies password login, user, refresh and logout
contracts and proxies the public REST schema. All host listeners use 127.0.0.1.
Tech stack: Docker, PostgreSQL 17, PostgREST, Node, existing pg and tsx.

1. Add and run a failing HTTP health test (`npx tsx --test scripts/staging/harness.test.ts`).
2. Implement fixed local configuration, HMAC JWT validation, database/container
   identity guards, and staging-only bootstrap SQL in scripts/staging.
3. Implement the auth/proxy server and CLI setup/start/env/reload commands. Run
   the health test against the actual containers, not mocked database responses.
4. Add tagged synthetic profiles, products, customer/device and new workshop
   orders using additive inserts. Do not truncate, reset, or delete existing data.
5. Run HTTP login/refresh/logout, negative authorization, atomic sale rollback,
   partial parts receipt, and available financial document contract tests.
6. Document exact local app startup and known emulation limitations. Review the
   scoped diff and leave all other agents' work and migrations untouched.

No commits, production connections, application edits, package edits, or business
migration edits are permitted in this workstream.

## Quick Start

Run from `C:\Users\nazar\.codex\worktrees\chetech-taller-profesional\Chetarda-ai`.
No package scripts or `.env.local` edits are needed.

```powershell
# Terminal 1: idempotent database adapter + fixture seed + PostgREST + auth/proxy.
npx tsx scripts/staging/cli.ts start

# Terminal 2: unchanged app, staging process env overrides production .env.local.
npx tsx scripts/staging/cli.ts app --port 3001

# Optional status, safe config, and verification.
npx tsx scripts/staging/cli.ts status
npx tsx scripts/staging/cli.ts env
npx tsx --test scripts/staging/harness.test.ts scripts/staging/safety.test.ts scripts/staging/sdk.test.ts
npx tsx --test scripts/staging/storage.test.ts
npx tsx scripts/staging/integration.ts
```

If the bridge is already running, do not launch a second `start` process. `setup`
only prepares/reuses the containers and fixtures, `serve` starts only the bridge,
and `reload` reloads PostgREST's cache after the parent applies new migrations.

App: `http://127.0.0.1:3001`. API: `http://127.0.0.1:54341`.
PostgREST: `http://127.0.0.1:54340`. PostgreSQL: `127.0.0.1:54339`, database
`chetech_staging`, user `postgres`, password `chetech-local-test-20261005`.

Synthetic identities (same password: `Chetech-staging-only-20261005!`):

| Email | App Role |
| --- | --- |
| admin@staging.invalid | admin |
| tech@staging.invalid | tecnico |

Public **TEST-ONLY** anon JWT, used for both
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzQxL2F1dGgvdjEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMDAwMDAsImV4cCI6MjEwMDAwMDAwMH0.ol0qa0aFETynjbwr96kvE6py_0EJYsfLScXUeTs5kyc
```

`app` sets both public keys, the API URL, local database URLs, and explicitly
sets `SUPABASE_SERVICE_ROLE_KEY=""` before Next starts. It also explicitly blanks
ARCA production/homologation certificates, private keys and points of sale, and
sets production enablement false. Existing `.env.local` is left untouched and
never printed. A regression test invokes Next's actual env loader to verify
precedence. Fiscal issuance and service-role-only export paths intentionally fail
closed; use the authenticated app for ordinary document/PDF checks.

## Isolation And Contracts

The official image is pinned to `postgrest/postgrest:v16.4` and digest
`sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df`.
The dedicated login can assume only `anon` and `authenticated`, never postgres
or service_role. No RLS policies are loosened. The adapter changes only staging
`auth.uid()` to read both legacy `request.jwt.claim.sub` and PostgREST's JSON
`request.jwt.claims`, grants authenticated sequence usage for invoker RPCs, and
adds the two Storage bucket catalog compatibility fields.

Docker uses a harness-labelled internal DB network plus a harness-labelled
bridge required by Docker Desktop to publish PostgREST on loopback. All published
host ports bind only `127.0.0.1`; Node also rejects non-loopback peers, foreign
Host headers, nonlocal browser origins and private REST schema profiles. The
proxy never derives an upstream hostname from incoming requests. Direct local
PostgREST access remains available for diagnostics and is not a remote boundary.

Auth supports `/auth/v1/token?grant_type=password`, the `refresh_token` grant,
`GET /auth/v1/user`, and `POST /auth/v1/logout?scope=local|global|others`.
HS256 signatures, expiration, audience, issuer, allowed database roles and
synthetic subjects are checked. Access tokens expire after one hour; refresh
tokens rotate and support SSR's ten-second reuse interval and direct-parent
recovery. Logout revokes refresh sessions; existing access JWTs remain valid
until expiry, matching stateless Supabase behavior. Refresh state is in memory
and lost on bridge restart; log in again after a restart. This is not GoTrue and
does not implement signup, OAuth, OTP, MFA, Realtime or password recovery.

REST includes RPC, filters, embeds, HEAD/count headers, and single-row media
types. The proxy forwards real PostgREST errors and responses rather than
fabricating business data. The actual Supabase SDK and SSR cookie flow are tested.

Prepared schema/migration application belongs to the parent. The harness does
not apply application migrations, reset the database, remove containers, or
delete unrelated data. `seed` inserts two tagged new orders, a customer/device,
product, and synthetic profiles; repeated seeding preserves existing fixture
state and rejects ID collisions. Integration runs add unique tagged fixtures
for inspection and intentionally retain them. `--require-financial` makes
missing financial contracts a failure; otherwise unavailable contracts are
reported as explicit skips.

After parent migrations:

```powershell
npx tsx scripts/staging/cli.ts reload
npx tsx scripts/staging/integration.ts --require-financial
```

Stop the foreground auth/app processes with Ctrl+C. `cli.ts stop` stops only the
label-verified PostgREST container, leaving PostgreSQL and all data intact.

## Official References

Semantics checked against [PostgREST authentication](https://docs.postgrest.org/en/stable/references/auth.html),
[PostgREST configuration](https://docs.postgrest.org/en/stable/references/configuration.html),
[official PostgREST release](https://github.com/PostgREST/postgrest/releases/tag/v16.4),
[Supabase Auth API](https://github.com/supabase/auth#post-token), and
[Supabase sessions](https://supabase.com/docs/guides/auth/sessions).

## Bounded Local Storage

The optional bridge mock supports `POST /storage/v1/object/chetech-repair-files/<path>`,
`POST /storage/v1/object/sign/chetech-repair-files/<path>`, signed `GET` at that
path, and `DELETE /storage/v1/object/chetech-repair-files` with `prefixes`.
These match the installed Supabase SDK's upload, createSignedUrl, and remove
contracts. Signed URLs last 1-60 seconds and never point outside this local API.

Only JPEG, PNG and WebP are accepted, with matching file magic bytes, a maximum
of 8 MiB each, 128 objects, and 64 MiB total in-memory data. Paths must be
`orderId/userId/random.jpg|jpeg|png|webp`. Raw bytes and SDK multipart uploads
are supported. Upload/removal requires the JWT subject to match the path owner,
and `private.can_access_operations()` must pass against the actual staging
profile. Admins and technicians are both operations roles in this schema.
Order existence is checked after this guard, without revealing direct order
table fields to technicians. Existing objects are immutable. Removal is blocked
for any object linked by `repair_order_attachments`, matching evidence retention.

This is deliberately a **memory-backed mock, not the real Storage service or a
test of Storage's SQL RLS engine**. Objects are not persisted in `storage.objects`.
The parent app still creates and reads attachment metadata through real
PostgREST/RLS and its actual API handlers. Restarting the bridge loses image
bytes and refresh state but leaves database metadata untouched; sign in and
upload a new test image if necessary. No production buckets, credentials or
Storage URLs are read or contacted. Storage images must be synthetic.

Staging bootstrap now provides `storage.buckets.file_size_limit bigint` and
`allowed_mime_types text[]`. The parent can apply its own
`20261005202647_repair_private_attachments.sql` migration, then run `reload`.
The harness never applies that migration itself.

Storage contracts were checked against [upload](https://supabase.com/docs/reference/javascript/storage-from-upload),
[createSignedUrl](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl),
and [remove](https://supabase.com/docs/reference/javascript/storage-from-remove).

## Verification Snapshot

Verified on 2026-10-05 against the running prepared staging database:

- 13 tests passed across HTTP auth/RLS, safety, actual Supabase SDK/SSR cookies,
  and bounded Storage upload/sign/remove suites.
- `npx tsc --noEmit --incremental false` and `npx eslint scripts/staging` exited 0.
- HTTP integration passed atomic sale persistence and rollback, technician role
  limits, approval idempotency, stale-write detection, partial/excess parts
  receipt, cost redaction, paginated reads and available-stock RPC.
- Financial RPCs were not yet installed at this snapshot and were explicitly
  skipped, not claimed as passing. Require them after parent migration application.
- The two bucket compatibility columns were confirmed in staging. Attachment
  metadata migration/application and app browser/PDF verification belong to the
  parent; the harness does not claim those browser checks were performed here.

The parent may continue modifying/applying migrations. Rerun verification for the
latest state rather than treating this snapshot as a production readiness result.
