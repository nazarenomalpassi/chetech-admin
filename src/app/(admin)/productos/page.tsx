import { ProductsView } from "@/features/products/components/products-view";
import { getProductCategories, getProductPage } from "@/features/products/queries";
import type { ProductListParams } from "@/features/products/list-state";
import { requirePermission } from "@/lib/auth";

export default async function ProductosPage({
  searchParams
}: {
  searchParams: Promise<ProductListParams>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("products.view");
  const [result, categories] = await Promise.all([
    getProductPage({ ...params, includeCosts: profile.role === "admin" }),
    getProductCategories()
  ]);

  return <ProductsView canManage={profile.role === "admin"} categories={categories} products={result.products} pagination={result.pagination} filterParams={params} />;
}
