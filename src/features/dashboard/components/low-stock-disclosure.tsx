import { ChevronDown, Package } from "lucide-react";

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
    <Card className="self-start overflow-hidden rounded-[34px] p-0">
      <details className="group">
        <summary className="flex min-h-[7.5rem] cursor-pointer list-none items-center justify-between gap-4 p-5 outline-none transition-colors hover:bg-brand-50/70 focus-visible:bg-brand-50/70 lg:p-6 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-start gap-4">
            <span className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-[17px] border border-graphite/8 bg-brand-100 text-graphite sm:inline-flex">
              <Package className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="panel-kicker">Inventario critico</p>
              <h3 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[1.6rem]">
                Reposicion sugerida
              </h3>
              <p className="mt-2 text-sm leading-5 text-slate-500">
                Toca para ver los productos que necesitan reposicion.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="warning">{alertLabel}</Badge>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[15px] border border-graphite/8 bg-white text-slate-700 shadow-[0_8px_18px_rgba(20,20,19,0.05)]">
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
            </span>
          </div>
        </summary>

        <div className="border-t border-graphite/8 bg-brand-50/35 p-4 lg:p-5">
          <div className="max-h-[min(60svh,32rem)] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {products.length ? (
              products.map((product) => (
                <div
                  className="rounded-[22px] border border-graphite/8 bg-white/90 px-4 py-4 shadow-[0_10px_20px_rgba(20,20,19,0.04)]"
                  key={product.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 sm:truncate">{product.name}</p>
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
                No hay alertas de stock. El inventario de seguridad esta bajo control en este momento.
              </div>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}
