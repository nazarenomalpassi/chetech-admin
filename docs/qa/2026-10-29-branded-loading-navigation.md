# CHETECH branded loading and navigation QA

## Scope

- Reuses the original horizontal white SVG from the existing brand asset collection. Graphite/white, restrained television silhouette, existing typography and surface tokens.
- All 17 sidebar sections have named loading boundaries. The admin fallback covers future routes; root fallback covers the asynchronous admin layout on first load and refresh.
- Native Next Link pending state supplies an inline activity line. No routing interception, minimum splash duration, fake percentages, new package, database/auth changes or production writes.
- Mobile menu remains open while a destination is pending and closes on pathname change. Active links and Escape still close immediately.

## Automated Checks

- Red/green: original module lacked the logo/TV; original mobile menu unmounted the pending indicator early. Both reproduced before fixes.
- 27 focused tests passed (including existing mobile navigation test).
- Full suite: 191 files passed, 1,212 tests passed; 69 database/integration tests intentionally skipped by the existing runner configuration.
- TypeScript check and ESLint passed.
- Optimized Next 15.5 production build passed with test-only local service configuration; never used production data for QA.
- Diff whitespace check passed. Independent code review found the mobile pending issue, addressed with regression coverage.

## Browser Evidence

Headless installed Chrome, authenticated as the synthetic local admin, unmodified application against prepared isolated staging. Browser requests restricted to loopback. No orders, payments or customer messages created.

- Real section fallback observed for Products, Repairs and Visits.
- Root full-screen fallback observed on reload; disappears after content streams in.
- No horizontal page overflow at 390, 768, 1024 and 1366px.
- Desktop hover verified: 2px icon movement, subtle edge marker and background.
- Keyboard focus remains visible; destinations, current-page indicator and logout action preserved.
- Reduced motion disables loader animation and icon movement.
- A delayed local navigation keeps mobile pending feedback visible until arrival.
- Interrupting a delayed Sales navigation with Products ends at Products with no stale pending indicator.
- No browser runtime errors.

Local evidence: `tmp/qa/branded-loading/results.json`, screenshots in the same directory; test/build/lint logs in `tmp/qa/branded-loading-*.log`. The browser script is local QA scaffolding only and is not shipped.

## Limitations / Release

No physical iPhone/PWA test or production deployment performed. Real transitions that are already cached may finish without showing a loading screen; no delay is introduced just to display branding. The initial network connection before the server sends any HTML remains the browser's responsibility.
