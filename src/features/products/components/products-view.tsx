"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductFilters } from "@/features/products/components/product-filters";
import { ProductFormDialog } from "@/features/products/components/product-form-dialog";
import { ProductTable } from "@/features/products/components/product-table";
import type { ProductFormValues } from "@/features/products/schemas";
import type { PaginationMeta } from "@/lib/pagination";

export function ProductsView({
  canManage,
  categories,
  products,
  pagination,
  filterParams
}: {
  canManage: boolean;
  pagination: PaginationMeta;
  filterParams: Record<string, string | undefined>;
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
    reservedStock?: number | null;
    availableStock?: number | null;
    minStock: number;
    isActive: boolean;
    notes: string | null;
  }>;
}) {
  const searchParams = useSearchParams();
  const filterKey = JSON.stringify([searchParams.get("search"), searchParams.get("category"), searchParams.get("status")]);
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductFormValues | null>(null);

  const totalProducts = pagination.total;
  const activeProducts = products.filter((product) => product.isActive).length;
  const lowStockProducts = products.filter((product) => (product.availableStock ?? product.stock) <= product.minStock).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="panel-heading">Productos</h1>
            <p className="mt-1 text-sm text-slate-600">{totalProducts} resultados. En esta pagina: {activeProducts} activos, {lowStockProducts} con stock bajo.</p>
          </div>

          {canManage ? (
            <Button
              onClick={() => {
                setSelectedProduct(null);
                setOpen(true);
              }}
            >
              <PackagePlus className="mr-2 h-4 w-4" />
              Nuevo producto
            </Button>
          ) : (
            <p className="text-sm text-slate-600">Catalogo de consulta</p>
          )}
        </div>
        <div className="mt-4"><ProductFilters categories={categories} /></div>
      </Card>

      <ProductTable
        canManage={canManage}
        filterKey={filterKey}
        onEdit={(id) => {
          const product = products.find(item => item.id === id);
          if (!product) return;
          // Keep the edit snapshot stable when server pagination revalidates behind the dialog.
          setSelectedProduct({ id: product.id, sku: product.sku, name: product.name, categoryId: product.categoryId, cost: product.cost, salePrice: product.salePrice, stock: product.stock, minStock: product.minStock, isActive: product.isActive, notes: product.notes ?? "" });
          setOpen(true);
        }}
        products={products}
        pagination={pagination}
        searchParams={filterParams}
      />

      {canManage ? (
        <ProductFormDialog
          categories={categories}
          onClose={() => setOpen(false)}
          open={open}
          product={selectedProduct}
        />
      ) : null}
    </div>
  );
}
