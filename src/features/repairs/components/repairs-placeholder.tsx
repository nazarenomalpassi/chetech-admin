import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function RepairsPlaceholder() {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Reparaciones</p>
        <h1 className="text-3xl font-semibold text-slate-950">Seguimiento técnico</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Estados, pagos parciales y contrato de datos tipado listos para construir el flujo de
          detalle y timeline.
        </p>
      </Card>
      <EmptyState
        description="La base soporta estados completos y pagos parciales en repair_payments."
        title="Módulo Reparaciones preparado"
      />
    </div>
  );
}
