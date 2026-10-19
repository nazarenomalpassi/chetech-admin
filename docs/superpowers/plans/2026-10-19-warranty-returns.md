# Warranty Returns and No-Fault Outcome Implementation Plan

> **For agentic workers:** Use executing-plans and independent code review. Follow test-first verification on isolated local staging.

**Goal:** Track repeated warranty visits on the same REP and allow a no-fault outcome and pickup without fabricated estimates or charges.

**Architecture:** Add an operational warranty-return child record with its own review, progress and custody history. The original order, intake date, warranty dates, quote, payments and delivery stay unchanged. One active return per order, optimistic concurrency and idempotent mutations prevent duplicate visits or overwritten work. A dedicated paginated inbox and an inline panel in each original order expose the same record to technicians and administrators.

**Tech Stack:** Next.js, React, Supabase/PostgreSQL, existing shared dialogs/forms, Vitest and synthetic local PostgreSQL/Playwright harnesses.

## Tasks
- [x] Add failing status/UI and database integration tests: no-fault without quote, guarded pickup, warranty intake/update/pickup/repeated visit, permissions, replay and competing writes.
- [x] Add safe migration: status constraints, no-fault pickup, RLS-protected return table, private transactional mutations/public invoker wrappers and bounded operations-only read RPC. Preserve financial rows and original delivery.
- [x] Add server actions and typed reads, warranty intake dialog, quick progress editor and paginated active/history inbox. Reuse shared components and current REP; no new customer/equipment intake.
- [x] Add No presenta fallas to all existing status controls/maps. Hide quote/approval inputs for this outcome; preserve real outstanding amounts and require explicit authorization for unpaid positive balances.
- [x] Run focused/full tests, SQL integration including concurrency, type/lint/build and mobile/desktop browser checks. Obtain independent review and resolve important findings.
- [x] Apply the verified migration and verify production schema read-only. Do not include unrelated unpushed MFA changes.

Release procedure: publish the isolated feature branch, merge after checks, and verify the canonical Vercel deployment. Record release evidence in the pull request.

## Acceptance
Warranty return registration is possible on a previously delivered order even if coverage metadata is missing/expired, with an explicit warning and administrator acknowledgement; it does not silently grant or extend coverage. A return needs only its date and reported issue; accessories/condition optional. Current progress and return delivery are separate from the original charged service. No-fault review does not require new financial or fault fields. Real prior debt is never erased or silently waived.
