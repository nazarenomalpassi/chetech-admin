import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import type { getWhatsAppSetupStatus } from "../setup";
import { toggleWhatsAppAutomation } from "../actions";

export function WhatsAppSettings({status}:{status:Awaited<ReturnType<typeof getWhatsAppSetupStatus>>}) {
  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-950">Comprobantes por WhatsApp</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Ingreso al guardar la orden. Pago y garantía al registrar el retiro. Desde el WhatsApp del local: 3571 544683.</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.enabled && status.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{status.enabled && status.ready ? "Activo" : status.ready ? "Listo para activar" : "Pendiente de conexión"}</span>
    </div>
    <p className="text-sm text-slate-700">{status.message}</p>
    <div className="grid gap-2 text-sm sm:grid-cols-3">{[
      ["Número comercial conectado",status.connected], ["Dos mensajes aprobados",status.templatesApproved], ["Confirmaciones de entrega",status.webhookVerified]
    ].map(([label,done])=><p className="rounded-lg border border-slate-200 px-3 py-2" key={String(label)}><span className={done ? "text-emerald-700" : "text-slate-500"}>{done ? "Confirmado" : "Pendiente"}</span><br/>{label}</p>)}</div>
    <form action={toggleWhatsAppAutomation}>
      <input type="hidden" name="enable" value={status.enabled ? "false" : "true"}/>
      <FormSubmitButton disabled={!status.enabled && !status.ready} idleLabel={status.enabled ? "Pausar envíos automáticos" : "Activar envíos automáticos"} pendingLabel="Actualizando..." />
    </form>
    <p className="text-xs leading-5 text-slate-500">Solo se envían comprobantes cuando el cliente autorizó recibirlos en su número. La activación se aplica a los próximos ingresos y retiros.</p>
  </Card>;
}
