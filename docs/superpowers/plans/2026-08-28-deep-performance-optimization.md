# CheTech deep performance optimization

**Goal:** Reduce navigation and data-loading latency without changing business behavior, permissions, balances, numbering, or historical records.

## Baseline

- Preserve the current passing quality baseline: 129 tests, typecheck, lint, and production build.
- Record route bundle sizes and read-only Supabase timings before changes.
- Confirm deployment and database regions before changing application code.

## Workstream 1: Request path and authorization

- Configure Vercel Functions in `gru1`, colocated with the Supabase `sa-east-1` project.
- Keep middleware responsible for session continuity and login redirects only.
- Keep role and permission enforcement in cached Server Component guards and every Server Action.
- Add regression coverage for middleware access decisions and cookie-preserving redirects.

## Workstream 2: Query waterfalls

- Fetch sales with nested payments and items in one PostgREST request.
- Fetch repairs with nested payments in one request while preserving schema fallbacks.
- Fetch invoice sale options and installment relationships in one request.
- Add pure mapping tests before replacing the existing query assembly.

## Workstream 3: Aggregates and historical payloads

- Reuse the cash summary RPC so Caja does not download the complete movement history to calculate balances.
- Add a RLS-preserving reports aggregate RPC to replace repeated raw-row metric queries.
- Add a repair-access summary RPC and cap the initial operational history; keep direct order lookup available.
- Add only query-backed indexes justified by the observed filters and ordering.

## Workstream 4: Verification

- Apply the SQL migration through Supabase and run performance/security advisors.
- Re-run read-only timing measurements and compare request count, payload, and latency.
- Run tests, typecheck, lint, and production build.
- Deploy to Vercel and verify the production Function region and core navigation paths.
- Update `PERFORMANCE_AUDIT.md` with findings, before/after evidence, residual risks, and follow-up priorities.
