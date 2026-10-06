# Chetech Performance Audit

Date: 2026-07-13
Environment: local production build connected to the configured Supabase project
Scope: authenticated administration modules, Supabase reads/writes, forms, PWA lifecycle, and runtime error handling

## Executive diagnosis

The application is built with Next.js 15 App Router, React 19, TypeScript, Tailwind, Supabase SSR, PostgreSQL, Server Components, and Server Actions. The main shell is persistent and route loaders already exist, so the measured delays are not caused by a full React application remount.

The primary latency comes from network round trips to Supabase and oversized reads. Repair Access previously loaded orders first and then loaded customer count, up to 500 full customer records, and import metadata in a second request wave. Sale creation performs more than ten database operations and several product updates sequentially. Repair intake writes customer, device, order, history, and audit separately.

The primary data-loss risk is the absence of persistent drafts. Server action validation and database errors redirect back to a route. That is safe for the database only when writes are atomic, but it destroys browser-only form state. A tab unload, mobile memory eviction, expired session, or chunk error has the same effect.

## Baseline measurements

Run:

```powershell
npx tsx scripts/measure-read-performance.ts
npm run test -- --run
npm run typecheck
npm run build
```

Read-only Supabase measurements taken before query changes:

| Query | Rows | Approx. payload | Duration |
| --- | ---: | ---: | ---: |
| Repair orders with relations | 92 | 124,250 bytes | 1,134 ms |
| Repair customers current load | 239 | 65,268 bytes | 1,089 ms |
| Repair customers candidate load | 40 | 9,885 bytes | 1,060 ms |
| Product category references | 183 | 10,066 bytes | 1,059 ms |
| Cash movements since cutoff | 312 | 28,039 bytes | 1,060 ms |

The absolute duration includes the same remote-network overhead for every REST request. The important differences are request waves and transferred bytes. Loading Repair Access in two sequential waves costs roughly two network latencies. Reducing the initial customer payload from 239 to 40 rows cuts that payload by approximately 85%.

The production build before this optimization reported 102 kB shared first-load JavaScript. The heaviest routes were Products at 141 kB, TV Boards at 143 kB, and Repair Access at 137 kB.

## Confirmed findings

### P0 - Multi-table writes are not atomic

- `src/features/sales/actions.ts` writes the sale, items, payments, two stock ledgers, product stock, cash movements, and audit separately.
- `src/features/repairs-access/actions.ts` writes the customer, device, order, status history, and audit separately.
- A failure after an early write can leave partial business data.

Implemented: transactional PostgreSQL functions with product row locks and authenticated security-invoker execution. The frontend keeps a legacy fallback for another environment that has not applied the migration yet.

### P0 - Critical forms have no recovery draft

Repair intake, technical follow-up, and sales hold important values only in React state or uncontrolled DOM fields. A redirect, refresh, mobile tab eviction, or session interruption loses those values.

Implemented: versioned, debounced local drafts; explicit recovery/discard; clear only after confirmed success; unload, browser-history, and internal-route warnings.

### P1 - Repair Access performs two read waves and downloads too many customers

The initial page read waits for orders, then starts three more reads. It transfers up to 500 complete customer rows even when the operator never opens Customers.

Implemented: one parallel request wave, 40 recent customers for immediate suggestions, and debounced/cancellable server search for the complete base.

### P1 - Dashboard downloads all cash movements

The dashboard downloads every movement since the configured cutoff and aggregates in Node.js. The payload grows permanently with business use.

Implemented: a stable PostgreSQL aggregate RPC grouped by payment method and period, with the current read as a migration fallback.

### P1 - PWA update can take over an active tab

The Service Worker calls `skipWaiting()`, `clients.claim()`, and deletes prior caches during activation. A live tab may still reference an older deployment's chunks.

Implemented: updates wait by default, show an explicit update notice, and reload only after user confirmation and only when no unsaved draft exists.

### P2 - Product category counts download every product reference

`getProductCategories` downloads all `category_id` values to count in JavaScript.

Implemented: PostgreSQL grouped count RPC, with a narrow fallback for compatibility.

### P2 - Shared authenticated caching would be unsafe

Supabase SSR reads cookies and may refresh authentication. Shared ISR/CDN caching can leak a `Set-Cookie` response or serve another user's authenticated output.

Decision: do not enable shared route caching. Use route prefetch, request parallelism, SQL aggregation, pagination, and narrow client drafts instead.

## Existing positive controls

- Route-level loading states exist for every major module.
- Root and admin error boundaries already prevent most blank screens.
- Server actions use Zod in the main operational flows.
- Pending-aware submit buttons already exist in several modules.
- Main history tables now use server pagination.
- Queries generally request explicit columns rather than `select('*')`.
- RLS and foreign-key indexes have dedicated migrations.

## Security notes

- No service-role key is exposed to client components.
- New RPCs use `security invoker`, authenticated execution, a fixed search path, and explicit grants.
- RLS remains enabled; no broad anonymous policy is introduced.
- Authenticated server responses remain dynamic and private.

## Changes implemented

### Query and navigation path

- Repair Access now starts orders, exact customer count, 40 recent customers, and import metadata in one parallel wave instead of two sequential waves.
- Customer search waits 250 ms, cancels stale requests with `AbortController`, and searches the complete base only after two characters.
- Product category totals are calculated by `get_product_category_counts()` instead of downloading one row per product.
- Dashboard cash totals are calculated by `get_dashboard_cash_summary()` instead of downloading the complete movement history.
- Historical modules use server-side pagination and retain URL filters; route loaders and persistent App Router layout avoid blank full-page transitions.
- Authenticated pages remain dynamic. No cross-user ISR/CDN cache was introduced.

### Atomic operations

Migration `supabase/migrations/20260713_performance_atomic_operations.sql` adds:

- `save_sale_atomic`: validates payments and products, locks product rows, saves sale/items/payments, updates both stock ledgers and cash, and writes audit in one transaction.
- `delete_sale_atomic`: verifies admin role, restores stock, removes related ledgers/cash, deletes the sale, and audits atomically.
- `save_repair_access_intake`: saves customer, device, intake order, status history, and audit atomically.
- `save_repair_access_technical`: saves technical follow-up, status history, and audit atomically.
- `update_repair_access_status_atomic`: locks the order and saves state/history/audit atomically, including safe cancellation checks.
- A monotonic sale-number sequence that never scans all sale numbers and never moves backward.
- Justified indexes for the current Repair Access ordering columns: `repair_access_orders(created_at desc)` and `repair_access_customers(created_at desc)`.

The migration was syntax-validated inside a transaction with rollback, then applied successfully to the configured Supabase project on 2026-07-13.

### Form resilience

- Repair intake, technical follow-up, and sales use versioned local drafts with a 500 ms debounce and a 30-day expiration.
- A draft is offered for explicit recovery or discard and includes its last-save timestamp.
- Drafts survive server validation errors, network errors, route changes, refreshes, and component unmounts.
- Drafts clear only after a precise success status is returned by the server.
- Internal links, Repair Access tabs, browser history, and page unload warn when changes are pending.
- Pending-aware submit buttons prevent duplicate form submission.
- No password, token, service key, or other authentication secret is stored in a draft.

### Runtime and PWA resilience

- The Service Worker no longer calls `skipWaiting()` or `clients.claim()` during normal installation.
- A new deployment waits and shows an operator-controlled update notice.
- Updating is blocked while any protected form has unsaved changes.
- Cache cleanup happens only after the new worker is deliberately activated or all old tabs close.
- `global-error.tsx` provides a final recovery screen without exposing raw errors.
- Section-level error boundaries remain in place for authenticated modules.

## After measurements

Read-only Supabase measurements after applying the migration:

| Query | Rows | Approx. payload | Duration |
| --- | ---: | ---: | ---: |
| Repair customers old load | 239 | 65,268 bytes | 759 ms |
| Repair customers initial load | 40 | 9,885 bytes | 705 ms |
| Product category references old path | 183 | 10,066 bytes | 701 ms |
| Product category aggregate RPC | 14 | 1,455 bytes | 701 ms |
| Cash movements old path | 314 | 28,209 bytes | 721 ms |
| Cash aggregate RPC | 3 | 434 bytes | 703 ms |

The network latency floor remained around 0.7 seconds in this run, but payload and client work changed materially:

- Initial Repair Access customer payload: 84.9% smaller.
- Product category-count payload: 85.5% smaller and one query instead of two.
- Dashboard cash payload: 98.5% smaller and no growth proportional to movement history.
- Repair Access initial dependencies now resolve in one network wave rather than two.
- Critical writes now use one RPC round trip instead of long chains of independent writes. Browser save latency was not benchmarked with permanent production mutations; the transactional rollback test validates behavior without fabricating business data.

Production build after the changes:

- Shared first-load JavaScript: 102 kB.
- Dashboard: 106 kB first load.
- Sales: 125 kB first load.
- Products: 141 kB first load.
- Repair Access: 141 kB first load, including draft recovery UI.
- TV Boards: 143 kB first load.

## Verification performed

- `npm test`: 28 files and 76 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npm run build`: passed; all 26 static pages generated and all dynamic routes compiled.
- `git diff --check`: no whitespace errors.
- HTTP production smoke: `/login` returned 200, protected `/dashboard` redirected to login, and protected customer API returned 401 without a session.
- SQL syntax: full migration passed inside `BEGIN`/`ROLLBACK` before application.
- SQL read reconciliation: category counts, total cash income, and total cash outcome match the original rows exactly.
- Atomic rollback test: existing sale edit/delete and Repair Access intake/technical/status operations ran under the authenticated role and rolled back; the sale and every affected stock value matched the pre-test state.
- ACL review: all seven new functions deny `anon`, allow `authenticated`, use `security invoker`, and have `search_path=public, pg_temp`.

No permanent sale, repair, customer, payment, stock, or cash test record was created.

## Cache strategy

No large client data-cache dependency was added. In this authenticated SSR application, adding TanStack Query or SWR to every module would duplicate Server Component state and increase bundle/complexity. The selected strategy is:

- persistent App Router shell and route prefetch for navigation;
- React request memoization for repeated settings/category reads;
- server pagination and narrow initial datasets;
- database-side aggregates for growing histories;
- static-asset-only Service Worker cache;
- explicit `revalidatePath` only for business routes affected by a successful mutation.

This avoids unsafe shared authenticated caching and stale financial data.

## Residual risks and next steps

### P1

- Invoice and installment write flows still contain some multi-call sequences. They were inspected and remain operational, but should receive the same transactional RPC treatment before very high concurrency.
- Repair Access currently caps the source dataset at 500 and progressively renders 36 cards at a time. A server-paginated order archive is still needed before the table reaches thousands of orders.
- Offline mode preserves drafts but does not queue financial writes. This is intentional: automatically replaying sales or stock changes after reconnect can duplicate transactions without an idempotency-key design.

### P2

- End-to-end authenticated browser automation is not configured in this repository. Real Chrome/iPhone checks for background-tab restoration, installation mode, keyboard navigation, and slow/offline network should be completed with a dedicated non-production Supabase project.
- The current Supabase network round trip varies by environment. Production Vercel Functions were verified in `gru1`, colocated with the Sao Paulo database; collect real-user timings before adding more application cache.
- Add production-safe observability for route and RPC duration using a provider that redacts customer data. Development scripts intentionally print no production console telemetry.

## Manual configuration

No SQL remains to be executed for the configured Supabase project: `20260713_performance_atomic_operations.sql`, `20260828134726_performance_read_aggregates.sql`, and `20260828135818_performance_atomic_expenses_salaries.sql` are already applied. Keep the migration files in version control so every future environment receives the same functions and indexes.

For a separate Supabase environment, run the complete migration file once before deploying this frontend. The compatibility fallbacks prevent a hard failure, but the optimized/atomic path is active only after the migration exists.

## Deep performance pass - 2026-08-28

### Current diagnosis

The second full pass confirmed that database execution time is not the main bottleneck at the current data volume. The dominant costs were remote request count, sequential request waves, an avoidable Vercel-to-Supabase region hop, and large client render trees.

- Supabase is deployed in `sa-east-1` (Sao Paulo).
- Production requests entered Vercel through `gru1`, but the Node Function executed in `iad1` (Washington, D.C.).
- `vercel.json` now pins Functions to `gru1`, colocating application reads and writes with Supabase after deployment.
- Middleware queried `profiles` for every protected navigation even though every page and Server Action already enforces its permission again.
- Sales, legacy repairs, invoice sale options, and installments had relation waterfalls after their initial list query.
- Reports performed 23 Supabase requests over three waves for one screen.
- Caja downloaded up to 500 cash movements to calculate balances in JavaScript.
- Repair Access could create up to 500 complex mobile cards in one render.

### Query map after optimization

| Module | Current initial read strategy | Pagination / bound |
| --- | --- | --- |
| Dashboard | Independent reads run in one parallel wave; cash totals already use an aggregate RPC | Low-stock list limited to 24 |
| Products | Product list and category counts run in parallel; filters execute in PostgreSQL | Current catalog is 206 rows; monitor before it reaches 500 |
| Sales | Paginated history includes payments and items in the same relational query; product options run in parallel | 25 history rows per page |
| Expenses | Single paginated history query | 25 rows per page |
| Legacy repairs | Paginated history includes payment relations in the same query | 25 rows per page |
| Repair Access | Orders, customer count, recent customers, and import metadata run in parallel | Source remains capped at 500; DOM renders 36 at a time |
| Invoices | Paginated list; form options run in parallel and sale items are nested | 25 invoices per page; options capped at 150/300 |
| Installments | Sales and installments are returned as one relation; dashboard installment owner is nested | Bound to 200 sales |
| Salaries | One bounded read | 200 withdrawals; current table has 24 |
| TV boards | One filtered read | Current table has 13 |
| Visits | Server filters plus bounded list | 300 rows; current table has 13 |
| Cash | Snapshot RPC plus settings and transfers in one parallel wave | 80 movements and 20 closures returned |
| Reports | Aggregate snapshot RPC plus business goals in one parallel wave | No historical raw rows transferred |

### Changes implemented

- Sales history: 3 requests became 1 relational request.
- Legacy repair history: 2 requests became 1 relational request.
- Invoice form options: removed the second sale-items request.
- Installments: removed both sales-to-installments and installments-to-sale waterfalls; customer/product filters now execute in PostgreSQL.
- Caja: `get_cash_page_snapshot` calculates balance inputs, daily totals, recent movements, and closures inside PostgreSQL.
- Reports: `get_reports_performance_snapshot` calculates three periods, rankings, seller summary, and technician summary inside PostgreSQL.
- Expenses and salaries: save/update/delete now use one atomic RPC each, including cash and audit writes in the same transaction.
- Middleware: removed the duplicate role query; page guards, action guards, RPC role checks, and RLS remain active.
- Static files no longer pass through authenticated middleware.
- Repair Access renders 36 matching orders initially and progressively reveals the rest without losing full-history client search.
- Sidebar links keep native Next.js route prefetch; no database prefetch or unsafe authenticated shared cache was added.

### Objective before/after measurements

Two read-only runs were made against the configured Supabase project. Values below are the average wall time; network variance is expected, while request and byte reductions are deterministic.

| Flow | Before | After | Request change | Payload change |
| --- | ---: | ---: | ---: | ---: |
| Sales history | 333 ms | 77 ms | 3 -> 1 | 15,226 -> 13,330 bytes |
| Repair history | 192 ms | 124 ms | 2 -> 1 | 17,099 -> 16,248 bytes |
| Caja | 257 ms | 121 ms | 5 -> 3 | 130,600 -> 22,505 bytes |
| Reports | 557 ms | 104 ms | 23 -> 2 | 39,355 -> 2,043 bytes |

The report aggregate was reconciled against independent legacy SQL for sales, profit, repairs, expenses, invoices, salaries, and net cash. Every value matched exactly. No sale, repair, expense, salary, stock, payment, or cash test record was created.

### Database decisions

Migrations applied:

- `20260828134726_performance_read_aggregates.sql`
- `20260828135818_performance_atomic_expenses_salaries.sql`

No new index was added in this pass. The live schema already has appropriate indexes for the observed `sold_at`, `entry_date`, `expense_date`, `created_at`, status, foreign-key, order-number, category, SKU, and cash-reference paths. Supabase's performance advisor reported only informational unused-index candidates and no missing foreign-key index. Removing or adding indexes without workload evidence would increase write cost unnecessarily.

All six new functions are `SECURITY INVOKER`, have fixed search paths and explicit grants, and preserve RLS. The post-migration security advisor reported no new warning caused by these functions. Existing warnings for older storefront/technician `SECURITY DEFINER` functions and disabled leaked-password protection are outside this performance change and remain separately actionable.

### Cache and rendering decision

No global React Query/SWR layer was introduced. Authenticated Server Components, selective `revalidatePath`, persistent layouts, route-level loaders, native route prefetch, database aggregates, and bounded histories already provide the required behavior with less invalidation risk. Financial pages must not reuse cross-user or stale shared responses.

### Remaining watch items

- Repair Access still transfers up to 500 orders so historical search remains behavior-compatible. Progressive rendering fixes the immediate mobile DOM cost, but full server-side archive pagination/search should be added before the table grows into several thousand orders.
- Products currently returns the complete filtered catalog. At 206 rows this is acceptable; add server pagination or windowing once sustained measurements show a material cost near 500-1,000 products.
- Auth still uses Supabase `getUser()` for authoritative server validation. The installed Supabase client predates local `getClaims()` support; upgrading authentication dependencies should be a separate security-tested change, not bundled into this pass.
- Real authenticated route timing should be collected after deployment from Vercel observability or a dedicated test account. This audit intentionally did not automate production login credentials or create business transactions.

### Final verification and production release

- `npm test`: 50 test files and 142 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with 28 generated routes and 102 kB shared first-load JavaScript.
- `git diff --check`: passed; only the repository's existing Windows line-ending notices were reported.
- Caja snapshot reconciliation: total income, total outcome, current-day income, and current-day outcome all matched the independent legacy calculation.
- Report snapshot reconciliation: sales, profit, repairs, expenses, invoices, salaries, and net cash all matched the independent legacy calculation.
- Supabase advisors: no missing foreign-key index finding and no new security warning from the six performance RPCs.
- Production deployment `dpl_DYPyxJeJjyNQE4qY9W7LiEsKa9Fx` completed successfully and was aliased to `https://chetech-admin.vercel.app`.
- Vercel inspection reports the deployed functions in `gru1`; an unauthenticated `/dashboard` request correctly redirects to `/login` and carries `X-Vercel-Id: gru1::gru1`.
- A clean browser reload of the public login page completed with the expected title and no console warnings or errors.

No production sale, repair, expense, salary, stock, payment, invoice, or cash transaction was created during verification.
