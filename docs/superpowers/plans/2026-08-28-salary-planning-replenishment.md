# Salary Planning And Replenishment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Sueldos into a monthly financial planning and proportional payroll tool, and add a Pedidos module generated from valid product sales.

**Architecture:** Keep `salary_withdrawals` and `movimientos_caja` as the accounting source of truth. Add configurable members, reserves, idempotent liquidation batches, and monthly replenishment overrides. Use one read RPC for salary planning and one read RPC for replenishment so sales and products are aggregated in PostgreSQL without N+1 requests.

**Tech Stack:** Next.js 15 Server Components and Server Actions, React 19, TypeScript, Zod, Supabase/PostgreSQL with RLS, Vitest, Tailwind CSS.

---

### Task 1: Pure payroll and replenishment calculations

**Files:**
- Create: `src/features/salaries/calculator.ts`
- Create: `src/features/salaries/calculator.test.ts`
- Create: `src/features/replenishment/model.ts`
- Create: `src/features/replenishment/model.test.ts`

- [ ] Write failing tests for 100%, 50%, 80%, excess, and a second partial payment.
- [ ] Implement cent-based proportional allocation using target salaries rather than fixed percentages.
- [ ] Write failing tests for excluded cancelled sales and quantity multiplied by historical/current unit costs.
- [ ] Implement deterministic merchandise aggregation and order totals.
- [ ] Run `npm test -- src/features/salaries/calculator.test.ts src/features/replenishment/model.test.ts` and expect all tests to pass.

### Task 2: Database model and atomic operations

**Files:**
- Create with Supabase CLI: `supabase/migrations/<timestamp>_salary_planning_replenishment.sql`

- [ ] Create `salary_members`, `financial_reserves`, `salary_liquidations`, and `replenishment_plan_items`.
- [ ] Extend `salary_withdrawals` with nullable liquidation metadata while defaulting historical rows to `extraordinary`.
- [ ] Seed Nazareno 800000, Matias Grandi 300000, Juanma Pitaro 300000, Santiago Pitaro 300000, rent 450000, repairs 300000, and other 0.
- [ ] Enable RLS and add admin-only policies on every new table.
- [ ] Add `get_salary_planning_snapshot(date)` and `get_replenishment_snapshot(date)` as `SECURITY INVOKER` aggregate functions.
- [ ] Add `confirm_salary_liquidation(...)` with an idempotency key, monthly advisory lock, target/remaining validation, withdrawal inserts, cash movements, and audit rows in one transaction.
- [ ] Add `save_replenishment_plan_item(...)` and `save_salary_planning_config(...)`; neither function may modify product stock.
- [ ] Apply the migration and run Supabase security/performance advisors.

### Task 3: Server data and actions

**Files:**
- Rewrite: `src/features/salaries/queries.ts`
- Extend: `src/features/salaries/actions.ts`
- Create: `src/features/salaries/types.ts`
- Create: `src/features/replenishment/queries.ts`
- Create: `src/features/replenishment/actions.ts`
- Create: `src/features/replenishment/types.ts`

- [ ] Parse and normalize both RPC payloads without per-product requests.
- [ ] Keep the existing extraordinary withdrawal actions compatible.
- [ ] Add validated Server Actions for liquidation, planning settings, quantity-to-order, and status.
- [ ] Revalidate `/sueldos`, `/pedidos`, `/caja`, `/dashboard`, and `/reportes` only after successful writes.

### Task 4: Pedidos module

**Files:**
- Create: `src/app/(admin)/pedidos/page.tsx`
- Create: `src/app/(admin)/pedidos/loading.tsx`
- Create: `src/features/replenishment/components/replenishment-view.tsx`
- Modify: `src/lib/navigation.ts`
- Modify: `src/lib/permissions.ts`

- [ ] Add month/year/search filters and KPI totals.
- [ ] Show product, SKU, sold quantity, stock, current cost, estimated cost, current price, supplier fallback, and status.
- [ ] Allow manual quantity and status updates per product.
- [ ] Keep `Recibido` informational and never increment stock.
- [ ] Add desktop table and mobile cards following the current CheTech visual system.

### Task 5: Salary planning UI

**Files:**
- Modify: `src/app/(admin)/sueldos/page.tsx`
- Rewrite: `src/features/salaries/components/salaries-view.tsx`
- Create: `src/features/salaries/components/salary-decision-panel.tsx`

- [ ] Add month/year selection and financial KPI cards.
- [ ] Show account balances, configurable reserves, historical/current replenishment cost, gross margin, and suggested salary capacity.
- [ ] Add a manual cumulative monthly decision input and live proportional distribution.
- [ ] Add an accessible confirmation dialog with one cash account per member and an idempotency key.
- [ ] Show paid, due now, remaining, coverage, and excess without generating writes while typing.
- [ ] Preserve extraordinary withdrawals and enrich history with member, type, target snapshot, percentage, date, account, and notes.
- [ ] Add editable centralized planning configuration for members and reserves.

### Task 6: Verification and release

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `src/lib/db/types.ts` only if generated/runtime types require it.

- [ ] Reconcile aggregate merchandise values against independent SQL.
- [ ] Verify all new functions are `SECURITY INVOKER`, RLS is enabled, and grants exclude `anon`/`public`.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Deploy to Vercel and verify the production alias and `gru1` runtime.
- [ ] Do not create production sales, stock movements, salary payments, or cash movements during verification.
