"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil, Power, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { PaginationNav } from "@/components/ui/pagination-nav";
import type { PaginationMeta } from "@/lib/pagination";
import { deleteProductAction, toggleProductStatusAction } from "@/features/products/actions";
import { formatCurrency } from "@/lib/utils";
import { confirmThen } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  cost: number;
  salePrice: number;
  stock: number;
  reservedStock?: number | null;
  availableStock?: number | null;
  minStock: number;
  isActive: boolean;
};

function ProductStockReadout({
  product,
  secondaryOnly = false
}: {
  product: Product;
  secondaryOnly?: boolean;
}) {
  const lowStock = (product.availableStock ?? product.stock) <= product.minStock;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <p className="font-semibold text-foreground">Físico {product.stock}</p>
      <p className="text-muted-foreground">Reservado {product.reservedStock ?? "sin confirmar"}</p>
      {!secondaryOnly ? (
        <p className="font-semibold text-foreground">
          Disponible {product.availableStock ?? "sin confirmar"}
        </p>
      ) : null}
      {!secondaryOnly && product.availableStock != null ? (
        lowStock ? (
          <Badge variant="warning">Disponible bajo</Badge>
        ) : (
          <Badge variant="success">OK</Badge>
        )
      ) : null}
    </div>
  );
}

export function ProductTable({
  canManage,
  filterKey,
  products,
  onEdit,
  pagination,
  searchParams
}: {
  canManage: boolean;
  filterKey?: string;
  products: Product[];
  onEdit: (id: string) => void;
  pagination?: PaginationMeta;
  searchParams?: Record<string, string | undefined>;
}) {
  const [isPending, startTransition] = useTransition();
  const [visibleLimit, setVisibleLimit] = useState(25);
  const visibleProducts = pagination ? products : products.slice(0, visibleLimit);
  const resetKey = filterKey ?? products.map((product) => product.id).join(",");

  useEffect(() => {
    setVisibleLimit(25);
  }, [resetKey]);

  function handleDelete(product: Product) {
    confirmThen(
      {
        title: `¿Eliminar "${product.name}"?`,
        description: "Se borra definitivamente y no se puede deshacer.",
        confirmLabel: "Eliminar producto",
        tone: "danger"
      },
      () =>
        startTransition(async () => {
          const result = await deleteProductAction(product.id);
          if (!result.success) toast.error(result.message);
        })
    );
  }

  return (
    <div className="table-shell">
      <div className="divide-y divide-border xl:hidden">
        {visibleProducts.map((product) => {
          return (
            <article className="min-w-0 bg-card px-4 py-3" key={product.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold wrap-break-word text-foreground">{product.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <p className="break-all">SKU {product.sku}</p>
                    <p className="wrap-break-word">{product.category ?? "Sin categoria"}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-foreground">
                    <span className="sr-only">Precio de venta </span>
                    {formatCurrency(product.salePrice)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.isActive ? "Activo" : "Inactivo"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <p className="font-semibold text-foreground">
                  Disponible {product.availableStock ?? "sin confirmar"}
                </p>
                {product.availableStock != null && product.availableStock <= product.minStock ? (
                  <Badge variant="warning">Disponible bajo</Badge>
                ) : null}
              </div>
              <details className="mt-1">
                <summary className="min-h-11 w-fit cursor-pointer rounded-lg py-3 text-sm font-medium text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
                  {canManage ? "Stock y costo" : "Detalle de stock"}
                  <span className="sr-only"> de {product.name}</span>
                </summary>
                <div className="space-y-2 pb-2 text-sm text-muted-foreground">
                  <ProductStockReadout product={product} secondaryOnly />
                  <p>Stock minimo {product.minStock}</p>
                  {canManage ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <p>Costo {formatCurrency(product.cost)}</p>
                      <p>
                        Diferencia precio-costo {formatCurrency(product.salePrice - product.cost)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onEdit(product.id)} type="button" variant="secondary">
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                    Editar
                  </Button>
                  <ActionMenu label="Más acciones">
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await toggleProductStatusAction(product.id, !product.isActive);
                        })
                      }
                      type="button"
                      variant="ghost"
                    >
                      <Power aria-hidden="true" className="h-4 w-4" />
                      {product.isActive ? "Desactivar" : "Reactivar"}
                    </Button>
                    <Button
                      disabled={isPending}
                      onClick={() => handleDelete(product)}
                      variant="danger"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Eliminar
                    </Button>
                  </ActionMenu>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-card text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-5">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              {canManage ? <th className="px-4 py-3 font-medium">Costo</th> : null}
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium sm:px-5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => {
              return (
                <tr
                  className="border-t border-border bg-card transition duration-200 hover:bg-card"
                  key={product.id}
                >
                  <td className="px-4 py-3 align-top sm:px-5">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{product.name}</p>
                      <p className="text-sm wrap-break-word text-muted-foreground">
                        SKU {product.sku}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {product.category ?? "Sin categoria"}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatCurrency(product.cost)}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {formatCurrency(product.salePrice)}
                      </p>
                      {canManage ? (
                        <p className="text-sm text-muted-foreground">
                          Diferencia precio-costo {formatCurrency(product.salePrice - product.cost)}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ProductStockReadout product={product} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={product.isActive ? "success" : "default"}>
                      {product.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    {canManage ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button onClick={() => onEdit(product.id)} size="sm" variant="secondary">
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <ActionMenu label="Más acciones">
                          <Button
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                await toggleProductStatusAction(product.id, !product.isActive);
                              })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <Power className="mr-2 h-4 w-4" />
                            {product.isActive ? "Desactivar" : "Reactivar"}
                          </Button>
                          <Button
                            disabled={isPending}
                            onClick={() => handleDelete(product)}
                            size="sm"
                            variant="danger"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </Button>
                        </ActionMenu>
                      </div>
                    ) : (
                      <p className="text-right text-xs text-muted-foreground">
                        Solo administracion
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <PaginationNav meta={pagination} pathname="/productos" searchParams={searchParams} />
      ) : null}
      {products.length && !pagination ? (
        <div className="flex flex-col gap-3 border-t border-border bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Mostrando {visibleProducts.length} de {products.length} productos
          </p>
          {visibleProducts.length < products.length ? (
            <Button
              onClick={() => setVisibleLimit((current) => Math.min(current + 25, products.length))}
              type="button"
              variant="secondary"
            >
              Mostrar más productos
            </Button>
          ) : null}
        </div>
      ) : null}
      {!products.length ? (
        <div className="empty-panel border-t border-border">
          No hay productos que coincidan con estos filtros. Probá otra busqueda o limpia los
          filtros.
        </div>
      ) : null}
    </div>
  );
}
