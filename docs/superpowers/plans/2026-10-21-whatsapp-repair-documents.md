# Repair document WhatsApp delivery implementation plan

**Goal:** Send the approved intake PDF after creating a repair and the approved payment/warranty PDF after its first recorded pickup.

**Architecture:** A transactional database outbox captures an immutable order/payment snapshot. An authenticated server worker uploads the PDF to Meta and sends an approved utility template containing its media ID. Signed webhooks distinguish acceptance, delivery and reading. Ambiguous send outcomes are reconciled rather than blindly repeated. Existing historical orders are not bulk mailed.

**Stack:** Next.js Node routes, existing Supabase server clients, PDFKit, Postgres triggers and row locks, Supabase Cron/pg_net, Meta WhatsApp Cloud API.

## Tasks

- [x] Add queue schema, private snapshots and service-only claim/finalize functions. Keep RLS on public metadata; restrict financial content to the worker and existing PDF permissions.
- [x] Add a consent-aware wrapper around the existing atomic intake RPC. Add one clear customer opt-in checkbox to reception; preserve existing intake fields and numbering.
- [x] Capture first pickup through a database trigger so all existing pickup actions work, including the quick editor. Skip imports, edits and warranty-return pickups.
- [x] Add server configuration, strict recipient normalization, PDF media upload, approved template requests, bounded retries and explicit uncertain outcomes.
- [x] Add signed Meta webhook verification and monotonic status processing, including opt-out handling. Add a protected worker endpoint and after-save wakeup through pg_net when connected.
- [x] Add connection/readiness controls in settings and delivery state inside each order. Saving a repair remains independent of external delivery.
- [x] Verify meaningful unit tests, transaction rollback/concurrency in isolated staging, mocked Meta requests, real private PDFs, typecheck, lint and production build.
- [x] Complete independent review and apply the production migration while disabled; confirm existing business data is unchanged.
- [ ] Push, merge and deploy the application.
- [ ] External prerequisite: owner creates Meta Business and connects the number with approved DOCUMENT templates. Configure server credentials, activate and verify real delivery using a controlled recipient. This cannot be marked complete before Meta onboarding.

## Required external setup

The owner currently uses WhatsApp Business on a phone and WhatsApp Web. Production has no Meta credentials. Connection must preserve that usage through an eligible coexistence onboarding flow. Credentials stay in server environment variables; no secrets are collected in chat. The production UI must truthfully show connection pending until setup is complete.

## Message contracts

Both templates have a DOCUMENT header and exactly two positional body fields: customer name and repair number. Intake is a reception confirmation; payment/warranty confirms recorded pickup. They contain no marketing content. PDF contents reuse the approved builders, including actual ledger payments and original warranty dates.

## Delivery safety

One automatic job per order/document kind. Customer opt-in and a valid current phone are required. No browser automation sends messages. A failed provider request never rolls back a saved repair. Once a message submission may have reached Meta, automatic retries stop until a signed status webhook establishes its outcome.
