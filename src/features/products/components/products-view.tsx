"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
  const filterKey = JSON.stringify([
    searchParams.get("search"),
    searchParams.get("category"),
    searchParams.get("status")
  ]);
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductFormValues | null>(null);

  const totalProducts = pagination.total;
  const activeProducts = products.filter((product) => product.isActive).length;
  const lowStockProducts = products.filter(
    (product) => product.availableStock != null && product.availableStock <= product.minStock
  ).length;
  const unknownAvailability = products.filter((product) => product.availableStock == null).length;
  const rangeStart = products.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const rangeEnd = products.length ? rangeStart + products.length - 1 : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setSelectedProduct(null);
                setOpen(true);
              }}
            >
              <PackagePlus className="h-4 w-4" />
              Nuevo producto
            </Button>
          ) : null
        }
        description={
          <p aria-live="polite">
            Mostrando {rangeStart} a {rangeEnd} de {totalProducts} productos. En esta página:{" "}
            {activeProducts} activos, {lowStockProducts} con stock bajo.
            {unknownAvailability ? ` ${unknownAvailability} sin disponibilidad confirmada.` : ""}
          </p>
        }
        title="Productos"
      />
      <Card className="p-3 sm:p-4">
        <ProductFilters categories={categories} />
      </Card>

      <ProductTable
        canManage={canManage}
        filterKey={filterKey}
        onEdit={(id) => {
          const product = products.find((item) => item.id === id);
          if (!product) return;
          // Keep the edit snapshot stable when server pagination revalidates behind the dialog.
          setSelectedProduct({
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
          });
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
