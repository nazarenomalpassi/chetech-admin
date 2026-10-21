# CHETECH client documents integration

> Execution: test-driven-development, verification-before-completion and requesting-code-review.

**Goal:** Publish the approved equipment-intake and combined payment/warranty PDFs, populated from each real order, without changing financial or workshop state.

**Architecture:** Keep the existing authenticated document endpoint and versioned estimate. Read delivery order and its native/legacy payment relations in one PostgREST statement under existing RLS. Exclude mirrored/voided payments, reject ambiguous financial links, and never infer collections from an `is_paid` flag. Render the two approved designs with original brand assets and explicit pagination.

**Stack:** Next.js, Supabase JS/PostgREST, PDFKit, Vitest, isolated local staging.

## Implementation

1. Add failing document-model and route tests: verbatim budget detail, one budget total, real payments, partial/zero balances, warranty dates, private-field exclusion and recorded pickup requirement.
2. Implement a small read-only payment snapshot mapper and the typed client document model. Keep estimate snapshot behavior unchanged. No schema, authentication, ledger or cash updates.
3. Adapt the approved branded layout into a separate PDF renderer. Copy approved logo PNGs and medium font into `public/brand`; include assets in Next.js server tracing. Wrap every variable field and paginate long budgets, payment lists and warranty conditions without loss.
4. Rename the delivery download to `Pago y garantía` in the existing order actions. Keep intake and estimate links, mobile access and existing workflow intact.
5. Verify focused/full tests, typecheck, lint, production build, an authenticated isolated database read, route PDF generation and visual rendering of both normal and long examples. Check traced assets.
6. Request an independent code review, address findings, commit/push this isolated branch, merge a PR and verify Vercel production points to the merged commit.

## Content decisions

- Budget detail is copied verbatim from the order; no parts/labor itemization.
- Payments come only from the active ledgers. An actual final total differing from the budget is explicitly labeled, not silently substituted.
- No signatures, DNI, manual fill-in fields, invented payment times or fiscal claims in the new PDFs.
- Warranty dates derive from the original recorded pickup and stored duration, never generation time. Missing/inconsistent warranty data is clearly marked for review rather than fabricated.
- Intake retains the owner-approved 90-day wording with the prominent `Pendiente de revisión legal` label. It is not included in the payment/warranty document.
- No automatic WhatsApp sending. Downloading a PDF has no business side effects.

## Verification evidence

- Full application suite: 1,114 passing, 69 database-specific tests skipped by their existing environment gates; then all 40 document/component tests passed after the additional unknown-charge regression fix.
- Typecheck, ESLint and production build passed. Server trace includes both logo PNGs and all three brand fonts.
- Authenticated isolated PostgREST read matched canonical SQL payment totals. Both actual Next.js PDF endpoints returned private PDFs, technician/anonymous financial access was denied, and order data remained byte-for-byte unchanged.
- Normal intake and delivery fit one A4 page. Long synthetic examples continued over 6 and 8 pages; all pages were rendered and inspected, with complete text, repeated order references and unobstructed footers.
- Independent review caught historical zero/unknown-charge ambiguity. Both cases now have regression tests; no amount or payment is fabricated from the paid flag.
- Production requires only application deployment, with no schema migration or business-data changes.
