# Repair Warranty Returns and No-Fault Review

## Scope
- Same REP, customer and device. A warranty visit has its own intake reason, accessories, condition, technical state, progress, resolution and pickup history.
- One active visit per order; repeated visits remain in history. Original order, delivery/warranty dates, financial repair and native/legacy payments are unchanged by warranty actions.
- Operations-only read RPC; administrator intake/pickup, technician technical updates, no direct authenticated writes. Version conflicts and idempotency protect shared-account usage on multiple devices.
- No presenta fallas is separate from Sin solucion. Save it without estimates, approvals or new fault details; then register pickup. Existing positive unpaid estimates/amounts still require an explicit balance authorization and reason. No payment or invoice is fabricated.
- Existing quote/payment data is ignored when a stale no-fault form or direct workshop save RPC submits it. Delivered original orders are not reopened this way; use warranty reentry.

## Use
1. Find the delivered REP in Reparaciones, open its card or full record and choose Registrar reingreso por garantia.
2. Enter the return date and its reported issue. Accessories and condition are optional. Coverage exceptions require explicit acknowledgement and never extend the original warranty.
3. Open Garantias to see the active queue; update the return in place. Record the review outcome before pickup. Historial de retirados keeps completed visits.
4. For an ordinary no-fault inspection, select No presenta fallas and save; select Retirado por cliente, confirm recipient and pickup, and save again.

## Verification
- Full Vitest suite: 915 passed, 69 opt-in tests skipped (175 files).
- ESLint and optimized Next.js production build passed.
- Isolated PostgreSQL harness: full order/payment snapshots, native and linked legacy collections, coverage/date validation, repeated visits, status-only no-fault save, zero/null budget pickup, positive unpaid amount guard, direct-RPC preservation, role boundaries and stale writes.
- Concurrent PostgreSQL harness: duplicate start/update retry executes once, competing writes reject stale versions, one active visit, operation replay actor isolation.
- Independent review repairs: SQL guards also handle omitted/empty status; failed delivery dialogs preserve recipient, notes and confirmations for retry. Existing administrator correction paths remain available separately from warranty intake.
- Real authenticated browser at 390px: warranty intake, no-fault review, warranty pickup, history, unchanged original row; ordinary no-budget no-fault pickup; no runtime errors. Root overflow checked at 360, 390, 768, 1024 and 1366px.
- Existing staging sale/stock, workshop authorization/parts, invoice/collection/reversal tests passed. Authenticated route/role denial, disabled fiscal issuance and private PDF/photo access smoke tests passed.
- Browser checks use synthetic localhost data, not customer records. Physical iPhone/Safari/PWA testing is not claimed.

## Release
Migration: `20261019160949_workshop_warranty_returns.sql`, additive child table plus status/guard/read-function updates. Applied before the UI release; its version matches the production migration ledger. Existing 548 orders, 335 legacy payments, native payment records and configuration were compared by full-row hashes before/after and stayed unchanged. RLS enabled, anonymous execution denied, no synthetic cases inserted in production. Original working copy and unrelated pending MFA work remain untouched. Deployment completion is verified in the pull request and Vercel release status.
