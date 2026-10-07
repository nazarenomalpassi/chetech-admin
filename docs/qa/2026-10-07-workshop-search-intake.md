# Workshop Search and Reception Verification

## Scope

Repair order search retains the raw local typing draft across delayed server responses, including accents, trailing spaces, cleared queries and composition. Explicit workshop links and browser history restore their intended filters without resurrecting an older draft. Pagination, scope and existing permission boundaries are retained.

Reception is one responsive sheet with full name, telephone, address, date, equipment, brand, model, serial, accessories, color and reported fault. Rarely used fields remain mounted in one optional disclosure and are preserved on submit/edit. Existing customers are suggested from the database first; stale requests are canceled and keyboard selection follows customer identity rather than a shifting index.

The additive migration stores optional color, retains omitted values from older clients, recognizes legacy `Color:` values without rewriting history and normalizes global search. Numbering, cash, payments, custody, warranty and authorization were not changed.

## Verification

- Regression tests were observed failing before the corresponding fixes.
- `npm test`: 769 passed; 69 opt-in database tests skipped in the ordinary suite.
- `npm run lint`, `npm run typecheck` and `npm run build`: passed.
- Sequential isolated PostgreSQL intake/search and financial staging suites: 2 passed, with transactional rollback. Running these DDL suites concurrently is not supported because they share the disposable staging schema.
- Authenticated local application smoke: admin/technician routes, role denial, disabled fiscal issuance, private PDF generation and photo access passed. Only synthetic staging data was written.
- Local browser: partial `Bel` followed by `Belén Pérez` retained the complete input after server acknowledgement. Creating and reopening a synthetic order retained address, serial, accessories and color. The 390 px responsive breakpoint had no document-level horizontal overflow. This is browser emulation, not a physical iPhone test.
- Independent review findings on explicit navigation, remote result ordering, stable customer selection and storage failures were addressed and rechecked. No unresolved P1/P2 findings remained in the reviewed changes.

## Production Database Rollout

An ignored, verified operational export contains 50 tables and 8,359 rows. It is not a full PostgreSQL disaster-recovery backup and excludes Auth, Storage bytes, private schemas and infrastructure configuration.

The `workshop_intake_color_search` migration was applied using the Supabase migration API. Hash/count snapshots immediately before and after matched across all 50 operational tables, excluding only the newly added nullable device column. RLS policies and the existing intake/read RPC execution privileges and security modes were unchanged. No production test orders, payments, consents or deliveries were created.

Publish through a reviewed GitHub branch and the existing main-to-Vercel integration. Confirm the production deployment, source revision and canonical domain before announcing availability. Preserve the user's unrelated original workspace changes.
