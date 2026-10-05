import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  saveBusinessGoalsAction,
  saveRepairWarrantySettingsAction
} from "@/features/settings/actions";
import {
  getBusinessGoals,
  getRepairWarrantySettings
} from "@/lib/app-settings";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { cn } from "@/lib/utils";

export default async function ConfiguracionPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("settings.manage");
  const isAdmin = profile.role === "admin";
  const [businessGoals, repairWarrantySettings] = await Promise.all([
    getBusinessGoals(),
    getRepairWarrantySettings()
  ]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Configuracion</p>
        <h1 className="text-3xl font-semibold text-slate-950">Seguridad y ajustes</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Roles admin/tecnico, auditoria, backups y parametros del local.
        </p>
      </Card>

      {message ? (
        <Card>
          <p className={`text-sm ${message.success ? "text-graphite" : "text-rose-600"}`}>{message.message}</p>
        </Card>
      ) : null}

      {isAdmin ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">Backup</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Exportar datos del sistema</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Descarga un Excel con productos, ventas, gastos, reparaciones, facturacion y caja.
            </p>
            <a className={cn(buttonVariants(), "mt-5")} href="/api/backup">
              Descargar backup Excel
            </a>
          </Card>

          <Card>
            <p className="text-sm text-slate-500">Metas del negocio</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Objetivos mensuales</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Define tus metas del mes para ventas, ganancia, reparaciones y facturacion. Estas metas se
              reflejan despues en Reportes con avance real y desvio contra el objetivo.
            </p>

            <form action={saveBusinessGoalsAction} className="mt-6 grid gap-4 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="salesTarget">Meta de ventas</label>
                <Input defaultValue={businessGoals.salesTarget} min={0} name="salesTarget" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="profitTarget">Meta de ganancia</label>
                <Input defaultValue={businessGoals.profitTarget} min={0} name="profitTarget" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="repairsTarget">Meta de reparaciones</label>
                <Input defaultValue={businessGoals.repairsTarget} min={0} name="repairsTarget" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="invoicingTarget">Meta de facturacion</label>
                <Input defaultValue={businessGoals.invoicingTarget} min={0} name="invoicingTarget" step="0.01" type="number" />
              </div>
              <div className="lg:col-span-4">
                <button className={cn(buttonVariants())} type="submit">
                  Guardar metas mensuales
                </button>
              </div>
            </form>
          </Card>

          <Card>
            <p className="text-sm text-slate-500">Servicio tecnico</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Garantia predeterminada</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Se propone al asignar una garantia nueva. Cada orden puede conservar una duracion
              diferente y la cobertura empieza unicamente en la fecha efectiva de retiro.
            </p>

            <form action={saveRepairWarrantySettingsAction} className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full sm:max-w-xs">
                <label
                  className="mb-2 block text-sm font-medium text-slate-700"
                  htmlFor="repair-warranty-default-days"
                >
                  Duracion en dias
                </label>
                <Input
                  defaultValue={repairWarrantySettings.defaultDays}
                  id="repair-warranty-default-days"
                  max={3650}
                  min={1}
                  name="defaultDays"
                  step={1}
                  type="number"
                />
              </div>
              <button className={cn(buttonVariants())} type="submit">
                Guardar garantia
              </button>
            </form>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">Modo tecnico</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Ajustes protegidos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Podes usar el sistema operativo diario, pero backups y ajustes sensibles quedan disponibles solo para administradores.
          </p>
        </Card>
      )}

      <EmptyState
        description="A partir de aca podemos sumar usuarios, politicas RLS, categorias y parametros finos del local."
        title="Panel de configuracion listo"
      />
    </div>
  );
}
