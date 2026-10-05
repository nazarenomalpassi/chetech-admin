"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackagePlus, ShieldAlert, Store } from "lucide-react";

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
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="panel-kicker">Catalogo operativo</p>
            <h1 className="panel-heading mt-3">Productos</h1>
            <p className="panel-subheading mt-3">
              Administra el inventario con una lectura mas clara para mostrador: busqueda rapida,
              categorias visibles y alertas que saltan a la vista.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[31rem]">
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <Store className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Resultados filtrados
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{totalProducts}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <PackagePlus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Activos en pagina
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{activeProducts}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-finance-cautionSoft text-finance-caution">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Stock sensible en pagina
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{lowStockProducts}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex-1">
            <ProductFilters categories={categories} />
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
            <div className="status-banner">
              Modo tecnico: podes consultar el catalogo y los precios, sin alterar stock ni productos.
            </div>
          )}
        </div>
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
