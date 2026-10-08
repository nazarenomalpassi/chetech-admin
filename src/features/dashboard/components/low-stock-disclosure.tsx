import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type LowStockProduct = {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
};

export function LowStockDisclosure({ products }: { products: LowStockProduct[] }) {
  const alertLabel = `${products.length} ${products.length === 1 ? "alerta" : "alertas"}`;

  return (
    <Card className="self-start overflow-hidden p-0">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-500 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">
                Reposicion sugerida
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Productos por debajo del stock minimo.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="warning">{alertLabel}</Badge>
            <span className="inline-flex h-6 w-6 items-center justify-center text-slate-600">
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
            </span>
          </div>
        </summary>

        <div className="border-t border-graphite/8 bg-brand-50/35 p-4 lg:p-5">
          <div className="max-h-[min(60svh,32rem)] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {products.length ? (
              products.map((product) => (
                <div
                  className="border-b border-slate-200 py-3"
                  key={product.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 break-words">{product.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Minimo recomendado: {product.min_stock} unidades
                      </p>
                    </div>
                    <Badge className="shrink-0" variant={product.stock <= product.min_stock ? "danger" : "warning"}>
                      {product.stock} disponibles
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">
                No hay productos bajo el stock minimo.
              </div>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}
