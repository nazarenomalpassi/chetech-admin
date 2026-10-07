# Workshop Search and Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop repair search from losing typed text and restore a concise, complete reception sheet.

**Architecture:** Keep the local filter draft authoritative while server responses arrive. Preserve server-side pagination and search. Reuse the existing intake action/RPC, customer identity and draft recovery, adding only a nullable device color and backwards-compatible reads.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest/jsdom, Supabase/PostgreSQL, isolated local staging.

## Evidence and Boundaries

The 201 historical orders REP-000300 through REP-000500 contain names/phones/devices/brands/issues in all records, models in 200, serials in 188, accessories in 191, addresses in 148, and visual condition in 169. DNI appears once and email never. Historical imports can store `Color: ...` in visual condition. Do not rewrite or infer historical customer identities, alter order numbering, prices, cash, payments, delivery, warranty, consent, auth or roles.

## Task 1: Stable Search Draft

Files: `src/features/repairs-access/components/repairs-access-view.tsx`, `repairs-access-view.test.tsx`, `workshop-server-navigation.tsx`, `workshop-server-navigation.test.tsx`, `repair-access-orders-section.tsx`, `repair-access-orders-section.test.tsx`.

- [ ] Add regression tests for delayed `Bel` response after typing `Belén `, clearing while a response is pending, browser Back/Forward and composition input. Assert the exact input value, not only the router call.
- [ ] Run targeted Vitest and observe failures before implementation.
- [ ] Retain local ownership of filters after user changes. Do not assign `pageInfo.search` to a newer draft on asynchronous acknowledgements. Handle `popstate` as explicit navigation by reading `q`, `state` and `warranty` from the URL.
- [ ] Preserve raw spaces/accents in the input. Compare normalized query values for filtering; include technical diagnosis and budget detail in the client haystack, matching the server corpus.
- [ ] Suppress debounce navigation while IME composition is active. Cancel timers on cleanup and explicit pagination/navigation. Keep urgent keystroke updates outside transitions.
- [ ] Rerun targeted tests and retain server pagination/global lookup.

Regression intent:

```tsx
fireEvent.change(input, { target: { value: "Belén " } });
rerender(<RepairsAccessView {...props} pageInfo={{ ...pageInfo, search: "Bel" }} />);
expect(input.value).toBe("Belén ");
```

## Task 2: Single Reception Sheet

Files: `src/features/repairs-access/components/repair-access-new-order-wizard.tsx` and its component test.

- [ ] Add failing tests ensuring address, serial, accessories and color are visible without opening disclosures and contribute to `FormData` and recovered drafts.
- [ ] Keep `customerName` as one full-name string, labelled `Nombre y apellido`; do not split historical names.
- [ ] Replace the separate visible blocks with one responsive grid: name/phone, address/date, device/brand/model, serial/accessories/color, issue.
- [ ] Keep one `Otros datos (opcionales)` disclosure for alternate phone, DNI, email, customer notes, visual condition, priority, status and internal notes. Closed fields remain mounted and submitted.
- [ ] Preserve hidden order/customer/device IDs, original REP, dates, all edit values and local draft recovery.
- [ ] Abort old customer lookups and ignore stale responses after cancellation; retain keyboard selection and make suggestion dismissal safe on blur.
- [ ] Do not remount the form or reset typed fields merely because the same editing order arrives in a refresh.
- [ ] Rerun intake/draft/customer-selection tests.

## Task 3: Color Persistence and Consistent Search

Files: `src/features/repairs-access/schemas.ts`, `actions.ts`, `queries.ts`, `documents.ts`, `components/repair-access-order-detail.tsx`, new `device-color.ts` and tests, CLI-generated migration ending `workshop_intake_color_search.sql`, local integration SQL/test.

- [ ] Add failing tests for explicit color, legacy `Color: Negro`, non-color visual condition, omitted color on older payloads and full transaction rollback on invalid color.
- [ ] Create the migration using `supabase migration new workshop_intake_color_search` after discovering CLI help.
- [ ] Add `repair_access_devices.color text` with no backfill or non-null default and a length limit of 80. Preserve RLS and existing RPC privileges.
- [ ] Extend intake RPC insert/update: if `device_color` is present, store the trimmed string, including an explicit empty string; when omitted, preserve existing color. Preserve all other intake logic and numbering triggers.
- [ ] Forward optional `deviceColor` from the schema/action, map color in detail/list payloads and PDFs. Legacy fallback is read-only and recognizes only the explicit `Color:` prefix.
- [ ] Normalize server search accents and repeated spaces through a stable private helper and an anchored, checked update of the existing read RPC predicate. Do not change the RPC contract or its metrics.
- [ ] Export/verify operational backup before production DDL. Apply and test only locally first. Validate admin access, anonymous/technician denial for intake, old payload compatibility, and unchanged financial/custody data.

Color contract:

```ts
export function getRepairDeviceColor(device: { color?: string | null; visual_condition?: string | null }) {
  if (device.color != null) return device.color.trim();
  return device.visual_condition?.match(/^Color:\s*(.+)$/i)?.[1]?.trim() ?? "";
}
```

## Task 4: Verify and Publish

- [ ] Run `npm test`, `npm run lint`, `npm run build`, isolated financial/workshop SQL suites and authenticated staging smoke.
- [ ] Browser-test rapid typing and delayed responses, one-screen intake, existing-customer selection, color/accessories/series save/edit, draft recovery and document output. Use synthetic staging data only.
- [ ] Request independent review, address important findings and rerun affected verification.
- [ ] Compare production financial/custody baseline immediately before/after the DDL; do not create production test orders.
- [ ] Commit only task files, attach the created PR, integrate into main and verify Vercel Ready/Production/domain/SHA before announcing publication.
- [ ] Preserve the original dirty workspace; close only owned test tabs/processes and restore generated Next type references.
