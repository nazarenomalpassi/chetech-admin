# TV board claims and held MercadoLibre proceeds

## Behavior
- On a sold board with no confirmed release, Iniciar reclamo records an internal claim, with optional notes. It does not contact MercadoLibre.
- The exact sale net moves from pending to held. The published price is never used for receivables. Held proceeds are not cash and cannot be confirmed as released.
- Reclamos / dinero retenido shows every open claim even when inventory search/type/status filters exclude it. Global summary and dashboard use the same integer-cent partition.
- Resolver reclamo offers Volver a pendiente or Anular venta. Restoring never confirms a deposit, including after the estimated date. Cancellation excludes the net from proceeds and margin while preserving original amount, sale date, notes and event history; it does not delete or restock the board.
- Sold rows cannot be overwritten, deleted or silently returned to stock. Repeated claims preserve previous events. Administrators retain brand/model/price/cost editing.
- Duplicate requests replay once, conflicting device versions fail safely, and claim/release races serialize. Errors preserve drafts; an explicit read-only refresh updates an eligible stale version without discarding notes. Ineligible states block submission.

## Verification
- Full Vitest: 999 passed, 69 opt-in tests skipped, 179 files. ESLint, standalone TypeScript check and optimized production build passed.
- PostgreSQL 17 synthetic staging: start, restore, reopen, cancel, release, retry fingerprints, role boundaries, anonymous denial, direct REST-style bypass guards, event failure rollback, immutable history, unchanged cash/settings/products/sales and competing claim/release sessions.
- Authenticated browser: mobile 390px and desktop 1366px, real server actions and synthetic PostgREST. Covered held metric/global queue, restoration without release, manual release, cancellation confirmation, filter/history, stale refresh preserving notes and keyboard focus during a delayed request. No runtime errors; page overflow checked at 360, 390, 768, 1024 and 1366px.
- Existing sale/stock, workshop authorization/parts, financial invoice/collections/reversal integration tests passed. Staging auth/RLS/environment/Storage suite: 13 passed. Full authenticated application smoke passed, including placas-tv, role denial, disabled fiscal emission and private PDF/photo access.
- Counted paging regression covers 1007 boards and events with a simulated server cap of 37. Incomplete/count-drift reads fail instead of showing false zero totals. Legacy uncounted-reader behavior remains unchanged.
- Operational JSON backup preserves new board columns and events; older artifacts remain verifiable. Private idempotency receipts require a technical PostgreSQL backup and are not included in that application export.
- Independent backend and frontend reviews completed; important findings were fixed and re-tested. A generated Windows development-cache failure was isolated by archiving only the task cache; the clean-cache full app smoke passed. No business-code workaround was added.
- Physical iPhone/Safari/PWA testing is not claimed. Browser and SQL mutation checks used only guarded localhost synthetic data.

## Production preservation and release
Migration `20261020150731_tv_board_claims.sql` was applied successfully to the existing chetechweb project; its filename matches the production migration ledger. All pre-existing fields stayed identical by ordered SHA-256 fingerprints before/after: 25 boards, 549 operational orders, 332 financial repairs, 337 repair payments, 326 sales, 357 sale items, 328 sale payments, 220 products, 350 expenses, 688 cash movements, 22 invoices/items, 21 balance transfers, 24 salary withdrawals and 3 configuration rows. Empty financial tables remained empty. No real claim, release, cancellation or cash adjustment was performed.

Event RLS is enabled, anonymous RPC execution is denied, the private transition is owned by postgres and service-role event mutation privileges are absent. Existing permissions/authentication and all cash-base settings are unchanged. The original dirty checkout and unrelated pending MFA work remain untouched. GitHub PR and Vercel deployment evidence record the final publication status.
