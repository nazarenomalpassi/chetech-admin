import { ProductsView } from "@/features/products/components/products-view";
import { getProductCategories, getProducts } from "@/features/products/queries";
import { requirePermission } from "@/lib/auth";

export default async function ProductosPage({
  searchParams
}: {
  searchParams: Promise<{ search?: string; category?: string; status?: "all" | "active" | "inactive" }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("products.view");
  const [products, categories] = await Promise.all([
    getProducts({ ...params, includeCosts: profile.role === "admin" }),
    getProductCategories()
  ]);

  return <ProductsView canManage={profile.role === "admin"} categories={categories} products={products} />;
}
