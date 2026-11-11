# Repair Collections UX Implementation Plan

**Goal:** Complete the five approved workshop improvements without changing repair numbering, money rules, custody history or warranty start dates.

**Architecture:** Keep the existing authenticated financial and workshop RPCs as the only mutation boundary. Add state-returning financial actions and an in-place collection dialog. Reuse the same ledger and payment controls in the standalone payment screen. Search on the server before pagination. Payment drafts are local, owner-scoped, explicit to recover, and never count as a payment.

**Stack:** Next.js 15, React 19, existing Supabase SSR/RLS/RPCs, Vitest and isolated local browser/database tests.

## Delivery Steps

- [x] Reproduce the out-of-order lookup in `repairs-list.test.tsx`; invalidate old requests on input/edit/reset/unmount and apply only the current response.
- [x] Add owner-scoped payment draft tests and implementation. Include recovery, failed save/retry, successful clear, navigation guard and no automatic submission.
- [x] Add state-returning save/add payment actions using existing atomic RPCs. Preserve old redirect actions and validate authentication, dates, account splits, positive amounts and idempotency.
- [x] Add an in-place collection dialog launched from cards and full order details. Show live canonical balance, split payments, explicit save and a separate delivery step. Keep receipt links and delivery/warranty history unchanged.
- [x] Make accepting through the quick status selection equivalent to the single confirmation intent. Remove the duplicate acceptance modal while preserving rejection, correction and zero-amount safeguards.
- [x] Apply payment history search before count/range and preserve query/pagination. Keep current collection/edit targets independent of history pagination.
- [x] Run focused tests, complete test suite, lint, types and production build. Request independent review of security, concurrency, draft replay and money/custody separation.
- [x] Repeat the full browser workflow against a schema-only disposable local database. Verify partial/full payments, no duplication, direct pickup, PDF and QR access, search beyond page one and draft recovery. Delete that database afterwards.

## Publication Gate

Push a pull request, verify preview, merge and verify the exact production deployment and public access guards. No business test writes in production. Record the final merge SHA, deployment readiness and read-only smoke results in the pull request after deployment; local build success alone is not publication evidence.

## Non-Negotiable Boundaries

- No sequence reset, production test order, customer message, fiscal issuance, stock changes or modifications of historical balances.
- A recovered draft never selects another customer's order silently and never counts as proof that a payment was saved.
- Preserve one request ID across retries of identical payments; changing payment intent requires a new request ID.
- A network failure preserves user input. A confirmed successful save clears its draft before navigation.
- Delivery remains its own guarded operation; payment never starts warranty or silently marks a device as collected.
