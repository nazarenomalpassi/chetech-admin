import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ConfiguracionPage() {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Configuración</p>
        <h1 className="text-3xl font-semibold text-slate-950">Seguridad y ajustes</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Roles `admin` y `empleado`, auditoría y middleware ya están integrados a la base del
          proyecto.
        </p>
      </Card>
      <EmptyState
        description="Acá podés sumar usuarios, políticas RLS, categorías y parámetros del local."
        title="Panel de configuración listo"
      />
    </div>
  );
}
