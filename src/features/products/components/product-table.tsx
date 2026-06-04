"use client";

import { useTransition } from "react";
import { Pencil, Power, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  minStock: number;
  isActive: boolean;
};

export function ProductTable({
  canManage,
  products,
  onEdit
}: {
  canManage: boolean;
  products: Product[];
  onEdit: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

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
      <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="panel-kicker">Inventario activo</p>
            <h2 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">
              Lectura de productos
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            SKU, categoria, margen visual y estado operativo en una sola vista.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white/80 text-left text-slate-500">
            <tr>
              <th className="px-4 py-4 font-medium sm:px-5">Producto</th>
              <th className="px-4 py-4 font-medium">Categoria</th>
              <th className="px-4 py-4 font-medium">Costo</th>
              <th className="px-4 py-4 font-medium">Precio</th>
              <th className="px-4 py-4 font-medium">Stock</th>
              <th className="px-4 py-4 font-medium">Estado</th>
              <th className="px-4 py-4 font-medium text-right sm:px-5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const lowStock = product.stock <= product.minStock;

              return (
                <tr
                  className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white"
                  key={product.id}
                >
                  <td className="px-4 py-4 align-top sm:px-5">
                    <div className="space-y-1">
                      <p className="font-medium text-slate-950">{product.name}</p>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{product.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{product.category ?? "Sin categoria"}</td>
                  <td className="px-4 py-4 text-slate-600">{formatCurrency(product.cost)}</td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <p className="font-medium text-slate-950">{formatCurrency(product.salePrice)}</p>
                      <p className="text-xs text-slate-500">
                        Margen visible {formatCurrency(product.salePrice - product.cost)}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-950">{product.stock}</span>
                      {lowStock ? <Badge variant="warning">Stock bajo</Badge> : <Badge variant="success">OK</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={product.isActive ? "success" : "default"}>
                      {product.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 sm:px-5">
                    {canManage ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button onClick={() => onEdit(product.id)} size="sm" variant="secondary">
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
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

      {!products.length ? (
        <div className="empty-panel border-t border-graphite/8">
          Todavia no hay productos para mostrar. Cuando cargues el primero, el catalogo aparece aca.
        </div>
      ) : null}
    </div>
  );
}
