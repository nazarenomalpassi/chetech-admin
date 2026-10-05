# CHETECH audit implementation plan

**Goal:** Improve operational clarity, workshop navigation and accessibility while preserving accounting and permissions.

**Architecture:** Reuse the existing Next.js modules, server actions and Supabase roles. Add a shared semantic metric card; fix confirmed interaction bugs, not business formulas. Authenticate temporary audit sessions against existing roles through a localhost GET-only preview.

**Tech Stack:** Next.js 15, React 19, Supabase, Tailwind, Vitest, Testing Library.

## 1. Baseline and skills
- [x] Review installed design and audit skills; search Skills.sh for compatible additions.
- [x] Install KPI dashboard design, accessibility, performance and web quality audit.
- [x] Run baseline tests and dependency audit; inspect database integrity and advisors read-only.
- [x] Reproduce compressed workshop filters at 1366px using the browser.

## 2. Regression-first interaction fixes
- [x] Add tests for dialog focus during rerenders, Escape and keyboard trapping.
- [x] Fix dialog lifecycle without changing submit logic.
- [x] Add tests for workshop shortcut filtering and identifiable order links.
- [x] Implement status drilldowns, compact responsive workshop navigation and legible filters.

## 3. Metrics and responsive polish
- [x] Add and test semantic MetricCard, preserving grayscale branding.
- [x] Integrate it into dashboard, reports and technician dashboard.
- [x] Rename gross cash-flow metric rather than change balances; show negative amounts correctly.
- [x] Label report dates and progress indicators accessibly.
- [x] Review dashboard error handling so unavailable financial queries are not shown as zero.
- [x] Read complete replenishment alerts rather than a 24-product sample.
- [x] Defer workshop editors and progressively render products, preserving drafts and loaded rows.
- [x] Remove the 500-order cutoff without changing role boundaries; deduplicate shifted page offsets.

## 4. Verification and handover
- [x] Run all tests, typecheck, lint and production build.
- [x] Browse all administration modules and permitted technician modules read-only.
- [x] Check mobile, tablet and desktop layouts; verify filters and modal interaction without saving real records.
- [x] Document evidence, residual limits, security findings and deployment state honestly.
- [x] Independent read-only code review; reproduce and fix nonblocking interaction regressions.
- [x] Investigate final Auth 429 logs; reproduce and fix stale request-cookie forwarding after refresh without changing permissions.

Final verification: 65 test files / 192 tests passed, lint, typecheck and production build passed. Browser/HTTP checks cover 17 administration routes and 4 permitted technician routes. Production frontend publication blocked by the available Vercel account lacking access to CHETECH; the narrowly scoped read-limit migration is applied. Real transactional staging tests, sustained real session-refresh checks, physical iPhone/PWA checks and remaining security/scalability work are not marked complete.

No wholesale revert, financial mutation, credential changes, storefront permission changes or blind deployment of the dirty worktree.
