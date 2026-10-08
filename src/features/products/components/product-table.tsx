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

function ProductStockReadout({ product }: { product: Product }) {
  const lowStock = (product.availableStock ?? product.stock) <= product.minStock;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold text-slate-800">Fisico {product.stock}</p>
      <p className="text-slate-600">Reservado {product.reservedStock ?? "sin confirmar"}</p>
      <p className="font-semibold text-slate-950">Disponible {product.availableStock ?? "sin confirmar"}</p>
      {product.availableStock == null ? null : lowStock ? <Badge variant="warning">Disponible bajo</Badge> : <Badge variant="success">OK</Badge>}
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
    const confirmed = window.confirm(
      `Queres eliminar definitivamente "${product.name}"? Esta accion no se puede deshacer.`
    );

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteProductAction(product.id);
      if (!result.success) {
        window.alert(result.message);
      }
    });
  }

  return (
    <div className="table-shell">
      <div className="divide-y divide-slate-200 xl:hidden">
        {visibleProducts.map((product) => {
          return (
            <article className="bg-white p-4" key={product.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-950">{product.name}</p>
                  <p className="mt-1 break-words text-sm text-slate-500">SKU {product.sku}</p>
                </div>
                <Badge variant={product.isActive ? "success" : "default"}>
                  {product.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-sm text-slate-500">Categoria</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.category ?? "Sin categoria"}</p>
                </div>
                <div className="row-span-2 sm:order-last sm:row-span-1">
                  <p className="text-sm text-slate-500">Stock</p>
                  <div className="mt-1"><ProductStockReadout product={product} /></div>
                </div>
                {canManage ? <div>
                  <p className="text-sm text-slate-500">Costo</p>
                  <p className="mt-1 font-semibold text-slate-800">{formatCurrency(product.cost)}</p>
                </div> : null}
                <div>
                  <p className="text-sm text-slate-500">Precio de venta</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatCurrency(product.salePrice)}</p>
                </div>
              </div>

              {canManage ? (
                <p className="mt-3 text-sm text-slate-500">
                  Diferencia precio-costo {formatCurrency(product.salePrice - product.cost)}
                </p>
              ) : null}

              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => onEdit(product.id)} variant="secondary">
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <ActionMenu label="Mas acciones">
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
                    <Power className="h-4 w-4" />
                    {product.isActive ? "Desactivar" : "Reactivar"}
                  </Button>
                  <Button disabled={isPending} onClick={() => handleDelete(product)} variant="danger">
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                  </ActionMenu>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Solo administracion</p>
              )}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-white text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-5">Producto</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              {canManage ? <th className="px-4 py-3 font-medium">Costo</th> : null}
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => {
              return (
                <tr
                  className="border-t border-graphite/8 bg-white transition duration-200 hover:bg-white"
                  key={product.id}
                >
                  <td className="px-4 py-3 align-top sm:px-5">
                    <div className="space-y-1">
                      <p className="font-medium text-slate-950">{product.name}</p>
                      <p className="break-words text-sm text-slate-500">SKU {product.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.category ?? "Sin categoria"}</td>
                  {canManage ? <td className="px-4 py-3 text-slate-600">{formatCurrency(product.cost)}</td> : null}
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-slate-950">{formatCurrency(product.salePrice)}</p>
                      {canManage ? (
                        <p className="text-sm text-slate-500">
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
                        <ActionMenu label="Mas acciones">
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
                      <p className="text-right text-xs text-slate-500">Solo administracion</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination ? <PaginationNav meta={pagination} pathname="/productos" searchParams={searchParams} /> : null}
      {products.length && !pagination ? (
        <div className="flex flex-col gap-3 border-t border-graphite/8 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="text-sm text-slate-600">Mostrando {visibleProducts.length} de {products.length} productos</p>
          {visibleProducts.length < products.length ? (
            <Button onClick={() => setVisibleLimit((current) => Math.min(current + 25, products.length))} type="button" variant="secondary">Mostrar mas productos</Button>
          ) : null}
        </div>
      ) : null}
      {!products.length ? (
        <div className="empty-panel border-t border-graphite/8">
          No hay productos que coincidan con estos filtros. Proba otra busqueda o limpia los filtros.
        </div>
      ) : null}
    </div>
  );
}
