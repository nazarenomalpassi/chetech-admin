# Branded Loading and Navigation Implementation Plan

> For agentic workers: use executing-plans to implement and verify each step.

**Goal:** Show an authentic CHETECH television loading state during real section/reload waits, with restrained sidebar hover feedback.

**Architecture:** Server-rendered loading boundaries share one lightweight component. Next's own Link pending state supplies inline feedback; no global click interception, extra requests, artificial delays or auth changes. CSS uses existing brand assets/tokens and respects reduced motion.

**Tech Stack:** Next.js 15.5, React 19, Tailwind/CSS, Vitest and browser smoke tests.

## 1. Loading boundaries
- [x] Add `src/components/ui/module-page-loading.test.tsx`. Assert existing module fallback contains `/brand/chetech-horizontal-white.svg`, one accessible status and no interactive controls. Run it and confirm failure before implementation.
- [x] Create `src/components/ui/branded-loading.tsx`: decorative TV with original SVG logo, polite status text and indeterminate activity line. Expose `message` and `fullScreen` only.
- [x] Replace `module-page-loading.tsx` skeleton with the shared loading component and a `section` label.
- [x] Replace every admin route fallback with `<ModulePageLoading section="[section name]" />`; include Dashboard, Reports, Orders and missing Transfers. Add admin catch-all fallback and root `loading.tsx` for the async admin layout on reload.
- [x] Test every navigation route has a fallback, reload variant and unique live region.

## 2. Navigation feedback
- [x] Test pending hint active/inactive rendering using a mocked `useLinkStatus` and preserve link semantics.
- [x] Create `src/components/layout/navigation-pending.tsx` as a descendant of Next Link, with a fixed-size activity indicator and screen-reader label.
- [x] Add shared classes to desktop/mobile navigation without changing hrefs, permission filtering or logout. Close the mobile menu on route arrival so pending feedback is not unmounted early; active links and Escape still close immediately.
- [x] Add scoped CSS: subtle icon movement, inset edge highlight and background hover, visible keyboard focus, touch press feedback. Disable transforms/animation with reduced motion and gate hover to fine pointers.

## 3. Verification
- [x] Run focused tests, full `npm test`, `npm run typecheck`, `npm run lint`, and the production Next build with isolated local environment values.
- [x] Inspect real rendered components at 390, 768, 1024 and 1366px; confirm logo, no overflow, hover/focus, reduced motion, page fallback, refresh and rapid navigation. Use synthetic local data only.
- [x] Record evidence and any limitations in QA notes. Review the diff for unrelated changes. No production publish is requested in this turn.
