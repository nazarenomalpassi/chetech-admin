"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductFilters } from "@/features/products/components/product-filters";
import { ProductFormDialog } from "@/features/products/components/product-form-dialog";
import { ProductTable } from "@/features/products/components/product-table";
import type { ProductFormValues } from "@/features/products/schemas";

export function ProductsView({
  categories,
  products
}: {
  categories: { id: string; name: string; skuPrefix?: string | null }[];
  products: Array<{
    id: string;
    sku: string;
    name: string;
    category: string | null;
    categoryId: string | null;
    cost: number;
    salePrice: number;
    stock: number;
    minStock: number;
    isActive: boolean;
    notes: string | null;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedProduct = useMemo<ProductFormValues | null>(() => {
    if (!selectedId) return null;
    const product = products.find((item) => item.id === selectedId);
    if (!product) return null;

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      cost: product.cost,
      salePrice: product.salePrice,
      stock: product.stock,
      minStock: product.minStock,
      isActive: product.isActive,
      notes: product.notes ?? ""
    };
  }, [products, selectedId]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Catálogo</p>
            <h1 className="text-3xl font-semibold text-slate-950">Productos</h1>
          </div>
          <Button
            onClick={() => {
              setSelectedId(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
        <div className="mt-4">
          <ProductFilters categories={categories} />
        </div>
      </Card>

      <ProductTable
        onEdit={(id) => {
          setSelectedId(id);
          setOpen(true);
        }}
        products={products}
      />

      <ProductFormDialog
        categories={categories}
        onClose={() => setOpen(false)}
        open={open}
        product={selectedProduct}
      />
    </div>
  );
}
