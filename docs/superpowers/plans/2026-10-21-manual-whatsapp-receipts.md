# Manual WhatsApp Receipt Links Implementation Plan

**Goal:** Open the customer's chat in the local shop's WhatsApp Web with a protected receipt link, without paid API delivery.

**Architecture:** An admin-only same-origin POST reads the actual order/payment ledgers, builds the approved customer document and stores a fixed document-data snapshot behind a random 256-bit bearer token. Only its SHA-256 hash is stored. An unauthenticated PDF endpoint resolves that token through a narrowly scoped function in a dedicated, non-exposed schema. No anonymous access is granted to the existing private schema. Links expire after 365 days and administrators can revoke all links for either document type. GETs never issue or revoke links. No order, payment, warranty, stock or cash values change.

**Tech Stack:** Existing Next.js Node routes, Supabase/Postgres, PDFKit, native POST forms opening a new tab, current branded UI.

## Files And Tasks

- [ ] Tests first: `src/features/repairs-access/document-share.test.ts`, route tests, component tests and `scripts/staging/manual-document-shares.ts`. Assert token entropy/hash, scope/expiry/revocation, private error/cache headers, admin and origin checks, real payment totals, delivery gating and preserved order data.
- [ ] Add generated migration `20261021214432_manual_repair_document_shares.sql`: private snapshot table with RLS/no direct grants; authenticated admin issue/revoke/status RPCs; capability-only resolve wrapper using a dedicated `document_access` schema. Bound payload size and issue frequency, derive filenames from the stored order, audit issuance/revocation without recording bearer tokens.
- [ ] Add `document-share.ts` for token generation, headers, fixed-origin WhatsApp Web links and validated stored customer-document data. Reuse existing builders and financial ledger parser.
- [ ] Add POST `api/repair-access/document-shares` to prepare/revoke links. Native form target opens a processing tab and redirects to `https://web.whatsapp.com/send` with phone and message only after a successful save. Browser cancellation never implies a delivered message.
- [ ] Add GET/HEAD `api/comprobantes/[token]`: no login, only one scoped PDF, uniform unavailable response, no index/cache/referrer, no business mutation, no order-ID lookup and no arbitrary redirects. Include required PDF assets in server tracing.
- [ ] Add visible compact receipt buttons to the saved-order confirmation, order detail and quick workshop card, outside folded administrative actions. Payment/warranty requires actual recorded pickup. Keep desktop WhatsApp Web explicit and warn about the active sender session. Provide revocation control and mark automatic API delivery as optional/unconnected.
- [ ] Verify failing tests before implementation, then green tests, isolated database/HTTP flows, responsive/keyboard interaction, typecheck, lint and production build. Obtain independent security review.
- [ ] Apply additive production migration while verifying unchanged business fingerprints; push a PR, attach it, merge only after passing preview and verify the production commit/alias. Do not activate the paid automation or send messages to real customers during tests.

## Acceptance Details

The URL is a bearer capability: anyone it is forwarded to may view that one document until expiry/revocation. This limitation is disclosed in the UI. Link previews must not consume it. Repeated clicks do not invalidate an already-sent link. Revocation is explicit and confirmed. A correction produces a new snapshot; older links can be revoked. No delivery/read status is fabricated for manual sharing. WhatsApp Web uses the browser's existing session; CHETECH cannot select or verify its sender account.

## Verification Completed Before Publication

- Full suite: 1186 passed, 69 optional database tests skipped; typecheck, lint and optimized production build passed.
- Fresh isolated migration test: both document kinds, direct anonymous field minimization, nested JSON denial, 365-day expiry, type-specific revocation, throttling, admin/technician permissions and no anonymous access to the existing private schema.
- Issued financial snapshot stayed unchanged after real budget and native payment mutations inside a rolled-back synthetic transaction.
- Real authenticated HTTP flow passed for both documents without following WhatsApp redirects, including anonymous PDF/HEAD requests, repeat access, revocation and unchanged order.
- Browser checks at desktop and 390px: no nested forms, no page horizontal overflow, 44px touch targets. Native form probe found and fixed the noreferrer/Origin-null conflict; the form uses noopener, while the outbound 303 response applies no-referrer.
- Independent review closed with no remaining findings after minimizing non-rendered fields and validating snapshots before issuance.
- Additive production migration applied with identical business-data fingerprints. Shared-links table initially empty; paid API remains disabled with zero scheduled jobs.
- Publication and final production endpoint verification follow after the reviewed commit is pushed.

## Verification Commands

`npx vitest run src/features/repairs-access/document-share.test.ts src/app/api/repair-access/document-shares/route.test.ts`

`npx tsx scripts/staging/manual-document-shares.ts`

`npm run typecheck` / `npm run lint` / `npm test` / `npm run build`

Expected: green tests, forbidden admin operations for anonymous/technician users, valid anonymous PDF only with a live scoped token, invalid/expired/revoked tokens unavailable, and identical before/after business records.
