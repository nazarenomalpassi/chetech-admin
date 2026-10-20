# TV board claims implementation plan

> **For agentic workers:** Use executing-plans with independent code review. Implement and verify each task before production.

**Goal:** Track MercadoLibre claims internally, separating held board proceeds from pending and confirmed releases without changing shop cash accounts.

**Architecture:** `tv_boards` holds the current claim state and an optimistic version. An atomic, administrator-only RPC locks the board, validates the transition, writes immutable sale events and an idempotent receipt. Shared TypeScript classification partitions net proceeds into pending, held, confirmed and cancelled; estimated dates never confirm a deposit. Existing sale amounts and history remain intact.

**Tech Stack:** Next.js 15, React 19, Supabase/PostgreSQL 17, Zod, Vitest, local synthetic PostgREST staging and Playwright.

## Task 1: Financial model and regressions
- [ ] Add failing tests to `src/features/tv-boards/sales.test.ts` for manual-only release, claims, cancellation, integer-cent totals and partition invariance.
- [ ] Add `model.ts` for shared board/summary types. Implement `getTvBoardFinancialSummary` in `sales.ts`; pending requires sold, not released and no claim. Held and cancelled take precedence over estimates.
- [ ] Test dashboard uses that same classification, including overdue estimates and missing release dates.
- [ ] Run `npx vitest run src/features/tv-boards/sales.test.ts src/features/dashboard/financial-summary.test.ts`, confirm red then green.

## Task 2: Atomic persistence
- [ ] Create additive `tv_board_claims` migration: claim state/notes/timestamps/version columns, immutable `tv_board_sale_events`, private idempotency receipts, fixed-search-path private RPC with public invoker wrapper and admin RLS.
- [ ] Operations are `start_claim`, `resume_sale`, `cancel_sale`, `confirm_release`. Release and claim require an unreleased sold board; resolution requires an open claim. Restoring does not confirm a release. Cancellation preserves the sale but excludes proceeds and does not automatically restock.
- [ ] Validate expected version under row lock; advisory-lock operation IDs and verify exact request fingerprint on replay. Block direct claim-field changes, release while claimed/cancelled, sale overwrites and sold-row deletion.
- [ ] Add `claims.ts` schemas, `claim-actions.ts` RPC action/receipt validation and action tests. Update existing release action to use the same RPC and guard first sale with `sold_at is null`.
- [ ] Test real SQL transitions, duplicate/reused keys, concurrent claim/release, stale versions, role denials, direct-write bypasses, immutable events and unchanged cash/settings in `scripts/staging/tv-board-claims.ts`.

## Task 3: Read paths and interface
- [ ] `queries.ts` reads all pages in stable ID order, maps claim fields/events, filters through shared status logic. `page.tsx` supplies filtered inventory plus global claims and financial summary.
- [ ] Add a compact held-money metric and dedicated claims section. Main rows get `Iniciar reclamo`; claimed rows cannot release. Claim modal explains internal tracking, net money moved and safe outcomes. Preserve drafts on errors, pending lock, keyboard focus and mobile layout.
- [ ] Add filters for claims/cancelled and visible history. Use current CHETECH white/graphite styling with amber held, green released and muted cancelled states. Do not change global design, search, stock or unrelated modules.
- [ ] Dashboard displays pending and held separately, using all records and identical cent-based calculations. Do not add them to cash balances.
- [ ] Include sale events in the operational backup and update DB types.

## Task 4: Verification and release
- [ ] Unit/component tests cover mutations, receipt validation, filters and UI affordances. Run full `npm test`, lint, typecheck and build.
- [ ] Run synthetic SQL/concurrency and browser flows at 390 and 1366 px: start, retained amount, release blocked, restore, release, cancel, draft preservation and status filtering.
- [ ] Independent review of financial state machine/security and UI. Fix all important findings and re-run checks.
- [ ] Take read-only production financial fingerprints; apply migration; verify existing board fields/cash/settings unchanged and migration recorded. Align migration filename to actual applied version.
- [ ] Commit only worktree changes, push PR, attach PR, wait CI/preview, merge and verify Vercel canonical production is READY on the merged SHA. No synthetic production writes.
- [ ] Record evidence in `docs/qa/2026-10-20-tv-board-claims.md`; stop only task-owned local services.
