# Performance and Stability Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce navigation and save latency, make multi-table operations atomic, and prevent loss of repair and sale form data.

**Architecture:** Keep the existing Next.js App Router and server-action model. Add small client-side draft primitives for resilience, SQL RPCs for transactional writes and aggregated reads, and backward-compatible server fallbacks until migrations are applied. Avoid shared authenticated response caches because Supabase SSR sessions must remain private per user.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase/PostgreSQL, Vitest, Tailwind CSS.

---

### Task 1: Baseline and audit record

**Files:**
- Create: `PERFORMANCE_AUDIT.md`
- Modify: none

- [ ] Record query counts, bundle sizes, current list limits, PWA behavior, and known failure paths.
- [ ] Record the security decision not to use shared ISR/CDN caching on authenticated routes.
- [ ] Keep before/after measurements reproducible with exact commands.

### Task 2: Draft persistence primitives

**Files:**
- Create: `src/lib/form-draft.ts`
- Create: `src/lib/form-draft.test.ts`
- Create: `src/hooks/use-persistent-form-draft.ts`
- Create: `src/components/forms/draft-recovery-banner.tsx`

- [ ] Write failing tests for valid envelopes, expiration, safe parsing, and meaningful-draft detection.
- [ ] Implement versioned local draft envelopes with timestamps.
- [ ] Implement debounced localStorage persistence.
- [ ] Add `beforeunload` and internal-link protection while a form is dirty.
- [ ] Provide explicit restore and discard controls.

### Task 3: Protect critical repair and sale forms

**Files:**
- Modify: `src/features/repairs-access/components/repair-access-new-order-wizard.tsx`
- Modify: `src/features/repairs-access/components/repair-access-order-detail.tsx`
- Modify: `src/features/repairs-access/components/repairs-access-view.tsx`
- Modify: `src/features/sales/components/sales-list.tsx`

- [ ] Persist all intake, customer, device, issue, technical, budget, payment, and warranty fields.
- [ ] Restore drafts only after explicit user confirmation.
- [ ] Keep drafts after server/network errors and clear them only after confirmed success.
- [ ] Disable duplicate submissions with the existing pending-aware submit button.
- [ ] Warn before leaving with unsaved changes.

### Task 4: Atomic database operations

**Files:**
- Create: `supabase/migrations/20260713_performance_atomic_operations.sql`
- Modify: `src/features/repairs-access/actions.ts`
- Modify: `src/features/sales/actions.ts`

- [ ] Add an authenticated, security-invoker RPC for repair intake that saves customer, device, order, status history, and audit in one transaction.
- [ ] Add an authenticated, security-invoker RPC for sales that locks product rows and saves sale, items, payments, stock, cash, stock ledger, and audit atomically.
- [ ] Initialize collision-safe sale numbering.
- [ ] Keep a missing-function fallback so the deployed frontend remains operational before migration execution.
- [ ] Return friendly errors while preserving drafts.

### Task 5: Query and navigation optimization

**Files:**
- Modify: `src/features/repairs-access/queries.ts`
- Modify: `src/features/repairs-access/components/repair-access-customers-section.tsx`
- Modify: `src/features/products/queries.ts`
- Modify: `src/features/dashboard/queries.ts`
- Modify: `supabase/migrations/20260713_performance_atomic_operations.sql`

- [ ] Run independent Repair Access queries in one parallel wave.
- [ ] Reduce initial customer payload and search the full base through the existing debounced API.
- [ ] Replace full product category reference downloads with database aggregate counts.
- [ ] Aggregate cash dashboard totals in PostgreSQL instead of downloading every movement.
- [ ] Add only indexes justified by actual order/filter columns.

### Task 6: PWA and runtime resilience

**Files:**
- Modify: `public/sw.js`
- Modify: `src/components/pwa/pwa-register.tsx`
- Create: `src/app/global-error.tsx`
- Create: `src/lib/performance.ts`

- [ ] Stop immediate service-worker takeover of active sessions.
- [ ] Show a manual update notice and refuse reload while unsaved drafts exist.
- [ ] Add a global fallback that never exposes technical errors.
- [ ] Add development-only timing helpers without production console noise.

### Task 7: Verification and final report

**Files:**
- Update: `PERFORMANCE_AUDIT.md`

- [ ] Run focused red/green tests.
- [ ] Run the complete test suite, lint, typecheck, and production build.
- [ ] Run HTTP smoke tests without writing production data.
- [ ] Review SQL for RLS, permissions, search path, and rollback behavior.
- [ ] Document measured improvements, manual migration steps, and residual risks.
