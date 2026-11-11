# Private Repair QR Implementation Plan

> Follow test-first implementation and request an independent security review before merging.

**Goal:** Staff scanning an equipment QR reaches its existing repair order; everyone else receives only CHETECH branding, never a repair preview or login screen from the QR.

**Architecture:** A dedicated `/q/[id]` read-only route validates a server-confirmed user and an active operations profile, then checks the existing authorized order RPC. Denied, invalid, unknown and failed requests use the same static neutral HTML with private/no-store caching. Authorized requests redirect only to a fixed private order alias that reuses the existing workshop page and its permissions. Old full-document QR links rewrite to the gate; RSC navigation must remain untouched. No bearer permission in the QR, no service key, no changes to global login/session fallback or numbering.

**Tech Stack:** Next.js 15 route handlers, Supabase SSR getUser, existing profiles and read RPC, static branded assets, Vitest, local Chrome testing.

## Work Packages

- [x] Tests first: anonymous, unverified/expired cookies, inactive/customer/missing profiles, auth/RPC failures, invalid/unknown order, fixed redirect/no arbitrary next URL, identical neutral bodies, no private read before authorization, no-store/noindex/no-referrer/CSP.
- [x] Implement the public QR handler and shared response policy. Use a fresh request-scoped client; do not trust getSession or user_metadata for authorization.
- [x] Tests first: new label URLs use `/q/id`, retain REP/UUID and configured application origin, no personal details in the URL. Reuse for equipment, accessories and warranties.
- [x] Tests first: a protected `/reparaciones-access/orden/id` page reuses the workshop server page; legacy `view=detalle&order=id` rewrites exclude RSC navigation and preserve server guards. Keep QR branding assets public without broadening private route access.
- [x] Validate actual build routing, public body/headers and invalid-cookie behavior in Chrome on desktop/mobile. Confirm the existing PDF/API guards and unrelated session tests remain intact. Review private DB permissions read-only; no production test repairs.
- [ ] Independent review, full tests/lint/types/build, GitHub PR, preview and production verification. Document the shared-session limitation and first-login/rescan workflow for staff.

## Boundaries

A QR is not a password. Anyone holding an already-authorized shared device has that device's access; locking devices and protecting the administrator credentials remain operational requirements. An expired session fails closed to branding, without deleting or changing the user's account. Hardware/iPhone/PWA testing remains separate from browser simulation.
