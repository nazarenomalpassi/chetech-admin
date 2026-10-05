# Product List Integration Contract

## Server and Props

`getProductPage(params)` is the paged list API. The page awaits permission first and sets `includeCosts` only for admin; technicians use the existing `get_technician_product_catalog` table-returning RPC with p_search=null and external safe filters/count/range. No service role is used in product queries. Technician rows set cost=0 and never read the products table directly.

URL state: `search` (trimmed, <=120 chars), `category` (UUID), `status` (all/active/inactive), `sort` (name/sku/stock/price), `page` (positive integer), `pageSize` (25/50/100). Invalid values fall back safely. Search requires all normalized query tokens across name/SKU, expands common Spanish accents through controlled PostgREST imatch patterns, and never embeds raw query grammar. Sort adds ID as a stable ascending tie-breaker. Filters/page-size changes reset page 1 and preserve other URL values; page links preserve all filters. A stale page clamps/refetches, including PostgREST PGRST103 (416).

Return:

```typescript
{
  products: Array<{
    id: string; sku: string; name: string;
    category: string | null; categoryId: string | null;
    cost: number; salePrice: number; stock: number; minStock: number;
    reservedStock: number | null; availableStock: number | null;
    isActive: boolean; notes: string | null;
  }>;
  pagination: PaginationMeta;
  filters: ProductListState;
  availabilityStatus: "ready" | "not-deployed" | "unavailable";
}
```

`ProductsView` now requires `pagination: PaginationMeta` and `filterParams: Record<string,string|undefined>` alongside existing canManage/categories/products. The products page already supplies them. Categories retain id/name/skuPrefix; fallback count is null (unknown), never fabricated from a truncated inventory query. The restricted category-count RPC remains preferred.

`ProductTable` accepts optional pagination/searchParams. When pagination is supplied it renders the entire server page and PaginationNav, not a second hidden 25-row window. Omitting pagination preserves legacy progressive rendering for existing callers/tests. Only the product page uses the paged path. All displayed active/low-stock counts are explicitly page-local; filtered total is pagination.total.

The dialog stores a selected edit snapshot, not a row ID that can disappear on page revalidation. Form fields, SKU generation endpoint, schema and mutation actions are unchanged. A new product opens with existing form defaults, not values copied from the page. This change does not add concurrency protection for a stale stock edit: parent reservation/schema guards must enforce safe writes.

## Parent Schema Coordination

No SQL migration, auth, permission, navigation, package or config file was changed by this block. Existing products columns and technician RPC return schema remain the minimum read contract. `stock` is physical stock, never silently replaced with free/available stock.

The agreed optional read contract is `get_workshop_product_availability(p_product_ids uuid[])`, returning a JSON array of `{id,reserved,available}` and guarding operations access. Product queries request only the fetched page's IDs in batches of at most 50; a 100-row page uses two parallel batches. Quantities come from the RPC, not a client-side subtraction that could miss reservations. `reservedStock`/`availableStock` are read-only props; the edit snapshot keeps the original physical `stock` and never submits either availability field.

Missing-function errors yield availabilityStatus=not-deployed and null quantities. Denied, incomplete, malformed or failed optional responses yield unavailable and null quantities without breaking the catalog. The table displays Fisico/Reservado/Disponible on desktop and mobile, using `sin confirmar` for unknown quantities. It does not fabricate zero reservations/free stock or show an OK availability badge when unknown. Low-stock indicators use available stock when confirmed; legacy physical-stock thresholds remain the fallback for page metrics. Parent SQL guards continue to own reservation-safe stock writes.

`availability-db.test.ts` can run with PRODUCT_AVAILABILITY_TEST_DATABASE_URL pointing only to the disposable localhost:54339 restore database. It uses a read-only transaction and checks actual RPC quantities, unchanged physical stock and denial without an authenticated operations identity. No stock write is performed.

Index/performance contract: evaluate category/is_active + name/id ordering and normalized name/SKU search indexes with EXPLAIN on realistic staging data. The current imatch filters bound transfer/render payload but may still scan server rows; do not claim database CPU/index optimization without measurements. For arbitrary locale normalization or indexed unaccent search, parent should provide a normalized search field/RPC with the same token-AND semantics and technician cost boundary. [PostgREST filtering documentation](https://docs.postgrest.org/en/stable/references/api/tables_views.html).

The export registry contains existing operational tables and the additive workshop/finance tables present in the shared migration files. When the parent adds another public table, extend the inventory/provenance and its coverage test before the final artifact/release. Optional pre-release tables are explicitly marked absent on the old source; permission errors are never treated as absence.
