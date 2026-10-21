import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import type { getWhatsAppSetupStatus } from "../setup";
import { toggleWhatsAppAutomation } from "../actions";

export function WhatsAppSettings({status}:{status:Awaited<ReturnType<typeof getWhatsAppSetupStatus>>}) {
  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-950">Comprobantes por WhatsApp</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">En cada orden ya podés preparar el ingreso o el comprobante de pago y garantía y abrir el chat en WhatsApp Web. Revisá que esté iniciada la cuenta del local: 3571 544683.</p></div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">Envío manual disponible</span>
    </div>
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Envío manual disponible: no necesita Meta Business ni utiliza la API paga. El cliente recibe un enlace protegido al PDF y vos confirmás Enviar en WhatsApp Web.</p>
    <details className="border-t border-slate-200 pt-2">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-600">Automatización con API (opcional, puede tener costo)</summary>
    <p className="text-sm text-slate-700">{status.message}</p>
    <div className="grid gap-2 text-sm sm:grid-cols-3">{[
      ["Número comercial conectado",status.connected], ["Dos mensajes aprobados",status.templatesApproved], ["Confirmaciones de entrega",status.webhookVerified]
    ].map(([label,done])=><p className="rounded-lg border border-slate-200 px-3 py-2" key={String(label)}><span className={done ? "text-emerald-700" : "text-slate-500"}>{done ? "Confirmado" : "Pendiente"}</span><br/>{label}</p>)}</div>
    <form action={toggleWhatsAppAutomation}>
      <input type="hidden" name="enable" value={status.enabled ? "false" : "true"}/>
      <FormSubmitButton disabled={!status.enabled && !status.ready} idleLabel={status.enabled ? "Pausar envíos automáticos" : "Activar envíos automáticos"} pendingLabel="Actualizando..." />
    </form>
    <p className="text-xs leading-5 text-slate-500">Solo se envían comprobantes cuando el cliente autorizó recibirlos en su número. La activación se aplica a los próximos ingresos y retiros.</p>
    </details>
  </Card>;
}
