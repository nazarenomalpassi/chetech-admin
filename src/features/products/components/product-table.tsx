"use client";

import { useTransition } from "react";
import { Pencil, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleProductStatusAction } from "@/features/products/actions";
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
  products,
  onEdit
}: {
  products: Product[];
  onEdit: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Costo</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const lowStock = product.stock <= product.minStock;

              return (
                <tr className="border-t border-slate-100" key={product.id}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.category ?? "Sin categoría"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(product.cost)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(product.salePrice)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{product.stock}</span>
                      {lowStock ? <Badge variant="warning">Stock bajo</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={product.isActive ? "success" : "default"}>
                      {product.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
