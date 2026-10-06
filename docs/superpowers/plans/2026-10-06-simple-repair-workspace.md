# Simple Repair Workspace Implementation Plan

> **For agentic workers:** Use executing-plans task checkpoints and request code review before merging. Each owned slice is independent; no edits to the original dirty checkout.

**Goal:** Make daily repair intake, progress, authorization and readiness usable from one workspace for the shop's shared administrator account, without weakening role boundaries or inventing business events.

**Architecture:** Keep the existing Supabase model, cash ledger, numbered REP and authorization/QC rules. Default to the order workspace for every permitted account; progressively disclose less frequent administration. Add one atomic, retry-safe RPC to save a quote, an explicitly checked client decision and a checked quality test together. Ordinary progress delegates to the existing protected workshop helper inside the retry-safe wrapper.

**Tech Stack:** Next.js 15, React 19, Tailwind, existing UI components, PostgreSQL/Supabase RPC, Vitest and local staging.

## Visual Direction

Preserve CHETECH fonts and graphite/white brand. Base #1d1d1b, paper #ffffff, soft surface #f7f8fa, border #e2e8f0, success #047857, attention #92400e. Status colors communicate actual events, never decorative financial values. One primary save action, touch targets >=44px, compact order identity and full REP without truncation. No new font, icon package, hero or ornamental motion.

```text
Reparaciones       Ordenes  Nueva orden  Clientes  Mas opciones
Buscar REP / cliente / equipo             Estado  Filtros
REP completa | Cliente | Equipo | Falla | Estado
Actualizar trabajo
  Estado + presupuesto + detalle + avance
  [ ] Cliente confirmo este presupuesto (canal si corresponde)
  [ ] Equipo probado (si marca listo)
  Guardar cambios
Cobrar | Ficha completa | Acciones y documentos
```

## Task 1: Navigation And List

Files: repairs-access-view.tsx, repair-access-orders-section.tsx, workshop-server-navigation.tsx and matching tests.

- [x] Write failing tests for admin default orders, retained explicit summary/import routes, deep links, return from intake and focus.
- [x] Default orders for the shared admin account; primary three destinations, secondary tools in one disclosure. Preserve role checks and search/query pagination.
- [x] Show workshop cards/editor on desktop and mobile, retain optional compact table and all existing actions. Never render two active forms per order.
- [x] Run `npm test -- src/features/repairs-access/components/repairs-access-view.test.tsx` and list regression tests.

## Task 2: Single-Screen Intake

Files: repair-access-new-order-wizard.tsx and its tests; action and schemas stay unchanged in this slice.

- [x] Write failing tests that customer name/phone, device type/brand/model, date and failure are visible together before navigation.
- [x] Remove mandatory step switching. Keep customer suggestions and hidden selected IDs; optional customer/equipment notes in labelled disclosures, mounted so edits are preserved.
- [x] Maintain operational date, REP generation on server, drafts, dirty navigation guard, editing values and all submitted field names. Do not assign a REP on client or clear fields on failed save.
- [x] Run `npm test -- src/features/repairs-access/components/repair-access-new-order-wizard.test.tsx` with creation/editing/submission/draft scenarios.

## Task 3: Atomic Explicit Confirmation

New public RPC contract:

```text
workshop_save_quick(
  p_order_id uuid,
  p_expected_version integer,
  p_operation_id uuid,
  p_payload jsonb,
  p_confirm_customer boolean,
  p_channel text,
  p_decision_notes text
) -> { id, version, replayed }
```

- [x] Create the migration with the installed Supabase CLI, not a made-up filename.
- [x] Add failing local SQL tests: legacy quote + explicit admin consent + QC -> ready; no consent/no QC -> unchanged; partial parts -> all rolled back; changed quote invalidates old consent; exact retry -> no duplicate event; changed payload/actor -> rejected; technical/anonymous accounts cannot approve; no cash/stock/payments/custody writes.
- [x] Use a private RLS-protected operation receipt and a private security-definer implementation with empty search path. Public wrapper is security invoker, authenticated/service grants only. Check persisted role and auth.uid(), lock order, check expected version, fingerprint exact request before mutation and bind retries to actor/order.
- [x] Compose existing protected workshop_save/workshop_decide functions in a single database transaction. Do not auto-check approval or QC. A failed final transition must roll back the saved quote and decision as well.
- [x] Run the new local rollback SQL plus `scripts/workshop-integration.sql`; do not exercise writes on live orders.

## Task 4: One Quick Editor

Files: new repair-quick-editor.tsx/tests, workshop-form.tsx/tests, coordination-actions.ts/tests and workshop card/detail integration.

- [x] Add failing action/component tests for one submit with explicit approval/QC, legacy quick save compatibility, disabled paid amount, role-bounded checkbox, duplicate clicks, conflict/error draft retention and returned version.
- [x] Show status, estimated amount, quote scope and progress together. Show a client-confirmation checkbox only when authorization is required or the quote changes; require explicit channel and free-work reason when applicable. QC is always a real checkbox, never inferred from the status.
- [x] Submit explicit confirmations to the atomic RPC; ordinary changes delegate to the existing protected helper within the same retry-safe RPC. Persist original version and operation identity until successful response so network retries do not duplicate decisions.
- [x] Keep the editor open on success, refresh the current order without navigating or losing the search/scroll; advanced customer/guarantee/payment information stays reachable in the full record.
- [x] Keep direct collection/invoice links, requests, delivery and PDFs available without silently collecting money or delivering an item.

## Task 5: Verification And Release

- [x] Run targeted and complete Vitest, local PostgreSQL regression, authenticated staging routes, lint, typecheck, production build and git diff --check.
- [x] Verify admin/shared-account navigation and a complete synthetic intake -> quote -> explicit confirmation/QC -> ready flow in the browser. Test representative mobile and desktop widths using supported tooling, report any emulation limitation honestly.
- [x] Independent review: role enforcement, false consent/QC, atomic rollback, idempotency, financial invariants, dirty drafts and hidden mobile actions.
- [x] Fresh private operational backup plus read-only financial/stock/history fingerprints before and after applying only the new additive migration. Preserve all real records and existing migrations.
- [ ] Commit, push feature branch, attach and merge PR only after verification. Verify Vercel Ready/Current, matching main SHA and production UI. Capture proof and report that the shared account cannot identify a particular person as actor.

## Scope Limits

No forced individual accounts, no auth/password changes, no fiscal activation, no retrospective client approval, no auto-QC, no removal of guards, no rewrite of balances or history, no production test repairs.

## Verified Checkpoint (2026-10-06)

- Full Vitest: 663 passed, 68 intentionally skipped; lint, typecheck and production build passed.
- PostgreSQL: 27 existing rollback suites, new quick-workflow rollback suite and five real two-session concurrency scenarios passed using synthetic local fixtures only.
- Browser: shared administrator entry, one-screen intake, return to newly created order, explicit consent/QC/readiness and failed-save draft retention verified locally. An internal 390px viewport verified mobile saving, full REP and no horizontal overflow; physical iPhone/PWA is not certified.
- Independent SQL review closed legacy same-state readiness, NaN/missing quotes, metadata bounds, paid amount mismatches and sub-cent rounding. Existing private helper differs only by preserving an absent quote instead of implicit zero; no role/ACL changes.
- Verified private operational export: 50 tables / 8297 rows, not a full PostgreSQL disaster-recovery backup. Migration workshop_quick_save applied to the intended production project as version 20261006203208.
- Immediate pre/post read-only fingerprints: all 18 historical groups, financial summaries, account balances and stock unchanged; migration count 76 -> 77. No production test order or business-event write.
- Release verification pending: push, reviewed PR merge, Vercel Ready/Current and live UI.
