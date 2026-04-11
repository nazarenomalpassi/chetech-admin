import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function SalesPlaceholder() {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Ventas</p>
        <h1 className="text-3xl font-semibold text-slate-950">Nueva venta</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          La base tipada ya está preparada para carrito, pagos múltiples, validación de stock y
          persistencia en `sales`, `sale_items`, `sale_payments` y `stock_movements`.
        </p>
      </Card>
      <EmptyState
        description="Implementá la UI del carrito sobre los esquemas y tipos definidos en src/features/sales."
        title="Módulo Ventas preparado"
      />
    </div>
  );
}
