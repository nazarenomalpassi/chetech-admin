# Frontend Audit Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve navigation speed, history scalability, accessibility, intermediate desktop layouts, and Chetech brand consistency without changing business data or accounting behavior.

**Architecture:** Add a shared pagination model used by server queries and page controls, then reduce the most expensive histories to bounded result sets. Introduce reusable accessible navigation and dialog primitives, refine the admin shell around the 1280 px breakpoint, and consolidate brand/accessibility rules in global styles.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Supabase/PostgreSQL, Vitest.

---

### Task 1: Shared pagination contract

**Files:**
- Create: `src/lib/pagination.ts`
- Create: `src/lib/pagination.test.ts`
- Create: `src/components/ui/pagination-nav.tsx`

- [ ] Write tests proving invalid pages fall back to page 1 and ranges use a fixed page size.
- [ ] Run `npm test -- src/lib/pagination.test.ts` and verify failure because the module does not exist.
- [ ] Implement `parsePage`, `getPageRange`, and `buildPaginationHref`.
- [ ] Add an accessible previous/current/next navigation component.
- [ ] Run the pagination tests and verify they pass.

### Task 2: Paginated operational histories

**Files:**
- Modify: `src/features/sales/queries.ts`
- Modify: `src/features/expenses/queries.ts`
- Modify: `src/features/repairs/queries.ts`
- Modify: `src/features/invoices/queries.ts`
- Modify: `src/app/(admin)/ventas/page.tsx`
- Modify: `src/app/(admin)/gastos/page.tsx`
- Modify: `src/app/(admin)/reparaciones/page.tsx`
- Modify: `src/app/(admin)/facturacion/page.tsx`
- Modify: corresponding list components

- [ ] Replace fixed `limit(100)` histories with Supabase `range(from, to)` and exact counts.
- [ ] Pass page metadata to list components and render the shared paginator.
- [ ] Preserve status/error/edit query parameters in pagination links.
- [ ] Confirm product options and edit data remain unchanged.

### Task 3: Faster and useful navigation

**Files:**
- Create: `src/lib/navigation-search.ts`
- Create: `src/lib/navigation-search.test.ts`
- Create: `src/components/layout/global-navigation-search.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-navigation.tsx`
- Modify: `src/components/layout/topbar.tsx`

- [ ] Write tests proving accent-insensitive module matching and an empty-query result.
- [ ] Run the tests and verify failure because the search helper is missing.
- [ ] Implement normalized navigation filtering.
- [ ] Remove forced `prefetch={false}` from navigation links.
- [ ] Replace the inert topbar input with an accessible module search and keyboard navigation.

### Task 4: Accessible dialogs and forms

**Files:**
- Create: `src/components/ui/dialog-shell.tsx`
- Modify: product and TV-board dialog components
- Modify: common forms in sales, expenses, invoices, visits, settings, and dashboard filters
- Modify: `src/app/globals.css`

- [ ] Implement dialog semantics, labelled title, Escape close, focus entry, focus restoration, backdrop close, and scroll lock.
- [ ] Add explicit `id`/`htmlFor` or `aria-label` associations to visible controls.
- [ ] Add live-region semantics to success/error feedback.
- [ ] Add `prefers-reduced-motion` handling for page and loading animations.
- [ ] Correct heading hierarchy so every module has one primary `h1`.

### Task 5: Intermediate responsive layout

**Files:**
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/topbar.tsx`
- Modify: `src/features/dashboard/components/dashboard-overview.tsx`

- [ ] Reduce the desktop sidebar footprint while keeping it fixed at the left edge.
- [ ] Prevent date wrapping and let the topbar search consume remaining width.
- [ ] Stack the dashboard heading and range filter below 1380 px.
- [ ] Verify no global horizontal overflow at 380, 1024, 1280, 1366, and 1440 px.

### Task 6: Chetech brand polish

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: navigation and primary module copy

- [ ] Add the restrained gray-green brand accent from the supplied stationery as a token.
- [ ] Remove decorative badges and repeated helper copy that do not support operations.
- [ ] Reduce nested-card visual noise in the updated surfaces.
- [ ] Correct visible Spanish accents and preserve financial semantic colors.

### Task 7: Verification

- [ ] Run focused tests after each red-green cycle.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Test authenticated pages in the browser without creating or deleting records.
- [ ] Check console errors, keyboard access, dialogs, pagination, and responsive widths.
- [ ] Review `git diff` to ensure no unrelated business or database changes were introduced.
