import { ProductsView } from "@/features/products/components/products-view";
import { getProductCategories, getProducts } from "@/features/products/queries";

export default async function ProductosPage({
  searchParams
}: {
  searchParams: Promise<{ search?: string; category?: string; status?: "all" | "active" | "inactive" }>;
}) {
  const params = await searchParams;
  const [products, categories] = await Promise.all([getProducts(params), getProductCategories()]);

  return <ProductsView categories={categories} products={products} />;
}
