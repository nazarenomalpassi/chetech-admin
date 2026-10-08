import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FiscalInvoicePanel } from "@/features/fiscal";
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
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Configuracion</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Exportaciones, objetivos del negocio, garantia y estado fiscal.
        </p>
      </header>

      {message ? (
        <Card>
          <p role={message.success ? "status" : "alert"} className={`text-sm ${message.success ? "text-graphite" : "text-rose-600"}`}>{message.message}</p>
        </Card>
      ) : null}

      {isAdmin ? (
        <>
          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Exportar datos del sistema</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              El Excel es una exportacion parcial para consulta. El JSON incluye los registros y
              un manifiesto para comprobar cantidades e integridad. Ninguno reemplaza el respaldo
              tecnico de PostgreSQL, usuarios y archivos privados.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
            <a className={cn(buttonVariants())} href="/api/backup">
              Exportar Excel
            </a>
            <a className={cn(buttonVariants({ variant: "secondary" }))} href="/api/backup?format=json">
              Exportar registros JSON
            </a>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Objetivos mensuales</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Se comparan con el avance real del mes en Reportes.
            </p>

            <form action={saveBusinessGoalsAction} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <div className="col-span-full">
                <button className={cn(buttonVariants())} type="submit">
                  Guardar metas mensuales
                </button>
              </div>
            </form>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Garantia predeterminada</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Se propone al asignar una garantia nueva. Cada orden puede conservar una duracion
              diferente y la cobertura empieza unicamente en la fecha efectiva de retiro.
            </p>

            <form action={saveRepairWarrantySettingsAction} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
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
          <FiscalInvoicePanel />
        </>
      ) : (
        <Card>
          <h2 className="text-lg font-semibold text-slate-950">Ajustes protegidos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Las exportaciones y los ajustes sensibles estan disponibles solo para administradores.
          </p>
        </Card>
      )}

    </div>
  );
}
