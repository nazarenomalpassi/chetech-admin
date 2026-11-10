# Workshop Firecrawl Completion Implementation Plan

> Execute in the existing isolated worktree, using test-first changes and independent review before production.

**Goal:** Complete the software scope of the approved Firecrawl V3 workshop plan without changing historical REP numbering, authentication or financial records.

**Architecture:** Reuse current intake, quick editor, parts RPCs, warranty child visits and private labels. Add operational presentation, read-only aggregate metrics and supplier-claim records with guarded server functions. All schema changes are additive; new actions preserve optimistic concurrency and operation IDs.

**Tech Stack:** Next.js 15, React 19, Supabase/Postgres, PDFKit, qrcode, Vitest, isolated Postgres validation.

## Coverage and Ownership

- [x] Private 80 x 50 mm equipment label with fault; saved-intake print and detail reprint (PR19, existing).
- [x] Operator cards: next action/blocker, location/date and active warranty fault; edit the active visit rather than the original quote.
- [x] Accessory labels and warranty-visit labels: same REP/QR, no new repair or stock movements.
- [x] Counter purchasing view: requested/ordered/partial/received/available counts, search, supplier and expected date; unknown unit cost remains null.
- [x] Supplier claims linked to a part/order and optionally a warranty visit, with versioned outcomes and no automatic refund/stock adjustment.
- [x] Fast location/next-review editing without selecting a technician; handoff notices derived from saved receipts.
- [x] Reception/collection checklist that reuses quality checks and separates actual return from money; preserve no-fault/free warranty behavior.
- [x] Full-dataset operational metrics, month-to-today range, sample-aware stage medians and mature warranty cohorts; never fabricate missing timestamps/costs or attribute work to people using a shared account.
- [x] Integrate Repuestos and Metricas in Reparaciones; preserve legacy Pedidos access and existing filters/search/drafts.
- [x] Test additive SQL in an isolated local DB with synthetic rows and rollback; verify read-only aggregates and no numbering changes.
- [x] Verify unit suite, lint, types, production build, desktop/mobile browser, private endpoints, deployment asset tracing and independent review.
- [ ] Publish additive DB migration, verify permissions/metadata and read-only results, push PR, merge after preview checks, verify production domain and commit.

## Test-First Work Packages

1. Extend card tests to cover pending approval, unreceived/arrived parts, closed order and active warranty. Run focused tests failing, implement, rerun.
2. Extend label tests/API/preview tests for equipment/accessory/warranty selection, same REP, body validation, same-origin POST, auth denial, missing visit, abort cleanup and exact-size PDFs. Run RED/GREEN and decode sample QRs.
3. Add unit-cost regression (`empty -> null`, `0 -> 0`) and part queue grouping tests for partial receipts; implement without replacing existing stock RPCs.
4. Add supplier claim schema/action/UI tests for authorization, operation replay, row version, quantities and resolution. Use additive table/private RPC/public invoker wrapper with limited grants, RLS and no financial mutation.
5. Add aggregate-contract/component tests and SQL fixture assertions for ranges, deduplication, missing events, closed visits, cohorts and timezone; do not compute global KPIs from paginated client data.
6. Add page/view tests for direct Repuestos/Metricas navigation, fallbacks and preserved query filters; integrate the independently verified work packages.
7. Run full verification, review the exact diff and publish through GitHub/Vercel. Record real test results and remaining operational dependencies.

## Outside Software Completion

Printer purchase/quotes, local adhesive/driver calibration, physical iPhone/scanner testing and a five-day shop pilot require the shop's hardware and participation. Silent-print bridges/certificates and paid messaging remain optional future decisions, not implied subscriptions or installations. No legal/fiscal changes, forced per-technician accounts, automatic WhatsApp sends or replacement of the current system.
