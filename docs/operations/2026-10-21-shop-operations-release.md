# Shop operations release - 2026-10-21

## Scope
Dashboard secondary disclosures; quick repair warranty and one-checkbox budget acceptance; explicit omitted-warranty correction from the original pickup; simplified visits with safe notes/tools and permissions; compact mobile products; manual next actions in Pedidos; permanently visible salary allocation; range-aware charts and known-cost coverage in Reports.

Future board releases require an explicit NX Santi (`nx`) or NX Local (`mp`) destination and confirmation that funds were transferred. A single database transaction creates one numbered sale, description snapshot item, payment, cash receipt, release event and audit record. Expected versions, shared row locks and operation receipts prevent stale updates and duplicate retries. Generated sales and financial projections are not independently editable/deletable. No catalog stock is consumed.

Historical releases and manual Placa sales are not backfilled or matched. Original ML sale dates remain unchanged; the generated sale and cash receipt use the actual confirmation timestamp. Unknown acquisition cost remains null and excluded from known margin, not assumed zero. Explicit zero cost remains valid. Shared sale sequence formatting preserves numbers above 9999.

## Verification
- 1101 unit/component tests passed; 69 opt-in tests skipped, with separate real PostgreSQL regression coverage below.
- Full ESLint and Next production build passed, including TypeScript checking.
- 13 staging auth/RLS/storage tests passed.
- Existing real sale/stock, workshop/parts and document/payment/reversal integration passed.
- Warranty SQL regression passed: permission, confirmation, replay/version, audit, original pickup/payment preservation and same-REP return.
- Board SQL regression passed: both accounts, stable/changed-account retries, claim/release races, six-stage rollback, unknown/zero costs, SQL report coverage, existing-row hashes, sequence overflow and concurrent same-receipt replay.
- Authenticated board browser flow passed: claims, restoration, cancellation, conflict recovery, explicit account, generated immutable sale and no unrelated cash changes.
- 102 route/viewport checks passed across 17 modules and six widths (360 through 1920 px), with no root horizontal overflow or visible unlabelled fields.
- Authenticated route/role/PDF/attachment smoke passed. Physical iPhone/Safari/PWA remains untested.
- Independent reviews completed; technician visit-note checklist preservation and negative goal bar were corrected and retested.

## Production schema
- `20261021144941_repair_warranty_correction.sql`
- `20261021144948_tv_board_release_sales.sql`
- Both applied successfully. Read-only before/after checks in `scripts/shop-operations-preservation.sql` matched all 19 nonempty existing relations, including cash, settings, sales, items/payments, repair orders/payments and stock.
- Security advisor findings unchanged from baseline; no new exposed definer functions. Existing legacy/storefront and password-protection advisories are outside this release.
- No test financial transaction was executed in production.

## Deployment And Rollback
Deploy the matching application revision after these additive migrations. Do not drop origin columns, receipts or immutable financial history to roll back UI. A rollback must retain the DB safeguards and nullable-cost awareness for generated board sales. Historical exports remain available; the Excel extract now includes board origin and item description.

## Offline Proposals
Six full-page branded proposals (two each: Factura C model, warranty certificate, intake receipt) were produced outside the repository/public directory, rendered and visually inspected. They are not emitted documents and are not part of deployment. No fiscal issuance or automatic WhatsApp flow was enabled. Final layout, fiscal identity and actual warranty conditions require owner approval before adoption.
