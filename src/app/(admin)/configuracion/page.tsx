import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { saveBusinessGoalsAction, saveCashSettingsAction } from "@/features/settings/actions";
import { getBusinessGoals, getCashSettings } from "@/lib/app-settings";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { cn } from "@/lib/utils";

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export default async function ConfiguracionPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentProfile();
  const isAdmin = profile.role === "admin";
  const [cashSettings, businessGoals] = await Promise.all([getCashSettings(), getBusinessGoals()]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Configuracion</p>
        <h1 className="text-3xl font-semibold text-slate-950">Seguridad y ajustes</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Roles admin/empleado, auditoria, backups y parametros del local.
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
            <p className="text-sm text-slate-500">Caja base</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Saldos y corte operativos</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Desde aca podes corregir saldos base y la fecha desde la que caja empieza a tomar movimientos, sin tocar codigo.
            </p>

            <form action={saveCashSettingsAction} className="mt-6 grid gap-4 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">EFECTIVO inicial</label>
                <Input defaultValue={cashSettings.openingBalances.efectivo} min={0} name="openingEfectivo" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">NX SANTI inicial</label>
                <Input defaultValue={cashSettings.openingBalances.nx} min={0} name="openingNx" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">NX LOCAL inicial</label>
                <Input defaultValue={cashSettings.openingBalances.mp} min={0} name="openingMp" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Fecha base de caja</label>
                <Input defaultValue={toDateTimeLocalValue(cashSettings.movementCutoff)} name="movementCutoff" type="datetime-local" />
              </div>
              <div className="lg:col-span-4">
                <button className={cn(buttonVariants())} type="submit">
                  Guardar ajustes de caja
                </button>
              </div>
            </form>
          </Card>

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
                <label className="mb-2 block text-sm font-medium text-slate-700">Meta de ventas</label>
                <Input defaultValue={businessGoals.salesTarget} min={0} name="salesTarget" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Meta de ganancia</label>
                <Input defaultValue={businessGoals.profitTarget} min={0} name="profitTarget" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Meta de reparaciones</label>
                <Input defaultValue={businessGoals.repairsTarget} min={0} name="repairsTarget" step="0.01" type="number" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Meta de facturacion</label>
                <Input defaultValue={businessGoals.invoicingTarget} min={0} name="invoicingTarget" step="0.01" type="number" />
              </div>
              <div className="lg:col-span-4">
                <button className={cn(buttonVariants())} type="submit">
                  Guardar metas mensuales
                </button>
              </div>
            </form>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">Modo empleado</p>
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
