import { ProductsView } from "@/features/products/components/products-view";
import { getProductCategories, getProducts } from "@/features/products/queries";
import { getCurrentProfile } from "@/lib/auth";

export default async function ProductosPage({
  searchParams
}: {
  searchParams: Promise<{ search?: string; category?: string; status?: "all" | "active" | "inactive" }>;
}) {
  const params = await searchParams;
  const [{ profile }, products, categories] = await Promise.all([
    getCurrentProfile(),
    getProducts(params),
    getProductCategories()
  ]);

  return <ProductsView canManage={profile.role === "admin"} categories={categories} products={products} />;
}
