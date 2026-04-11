import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function ExpensesPlaceholder() {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Gastos</p>
        <h1 className="text-3xl font-semibold text-slate-950">Control de egresos</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Quedó preparada la capa de validación y el modelo base para filtros por fecha/tipo,
          estadísticas simples y anulación lógica.
        </p>
      </Card>
      <EmptyState
        description="Continuá con formularios y métricas usando src/features/expenses/schemas.ts como contrato único."
        title="Módulo Gastos preparado"
      />
    </div>
  );
}
