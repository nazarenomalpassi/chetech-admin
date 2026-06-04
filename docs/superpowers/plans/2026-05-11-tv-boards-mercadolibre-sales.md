# TV Boards MercadoLibre Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the CHETECH TV boards module so each board can be marked as sold through MercadoLibre, tracking the real net amount, release date, and sale status without breaking existing inventory management.

**Architecture:** Keep `tv_boards` as the single source of truth and add nullable sale columns directly on the table. Derive the financial sale status in application code from `sold_at` and `release_date`, then surface that status in the table, KPI cards, and a dedicated sale modal.

**Tech Stack:** Next.js App Router, React Hook Form, Zod, Supabase/Postgres, Server Actions, Vitest

---

### Task 1: Lock the sale behavior with tests

**Files:**
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/schemas.test.ts`
- Create: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/sales.test.ts`

- [ ] Add a failing schema test for the MercadoLibre sale payload.
- [ ] Add a failing pure-logic test for derived statuses `unsold`, `pending_release`, and `released`.
- [ ] Run `npm test -- src/features/tv-boards/schemas.test.ts src/features/tv-boards/sales.test.ts` and confirm the failures are caused by missing sale logic.

### Task 2: Add schema and database support

**Files:**
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/schemas.ts`
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/lib/db/types.ts`
- Create: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/sales.ts`
- Create: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/supabase/migrations/20260511_tv_boards_marketplace_sales.sql`

- [ ] Add `tvBoardSaleSchema` with `id`, `netAmount`, `releaseDate`, and optional notes.
- [ ] Add sale-related database columns and typed row/update support for `tv_boards`.
- [ ] Implement small pure helpers that derive sale status from `sold_at` + `release_date`.

### Task 3: Implement the server action and data query expansion

**Files:**
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/actions.ts`
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/queries.ts`
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/app/(admin)/placas-tv/page.tsx`

- [ ] Add `markTvBoardSoldAction` with admin protection, validation, audit log, and `is_active = false`.
- [ ] Expand the boards query to fetch sale fields and derive presentational sale status safely.
- [ ] Support richer status filtering without changing the route shape outside this module.

### Task 4: Add modal, table actions, and KPI cards

**Files:**
- Create: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/components/board-sale-dialog.tsx`
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/components/boards-view.tsx`
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/components/board-table.tsx`
- Modify: `C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/tv-boards/components/board-filters.tsx`

- [ ] Add a premium modal flow for `Vendida`.
- [ ] Add the new table action and financial badges.
- [ ] Add KPI cards for `Ganancia real generada`, `Dinero pendiente de liberacion`, and `Dinero ya liberado`.
- [ ] Keep the current responsive shell intact.

### Task 5: Verify and ship

**Files:**
- Verify only

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Apply the SQL migration to Supabase.
- [ ] Deploy the updated frontend to Vercel.
