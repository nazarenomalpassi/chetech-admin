"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RepairAccessOrderRecord } from "../queries";
import { normalizeWhatsAppPhone } from "../whatsapp";

type DocumentKind = "intake" | "delivery";
type ShareOrder = Pick<RepairAccessOrderRecord, "id" | "customer" | "pickedUpAt" | "deliveredAt">;

const endpoint = "/api/repair-access/document-shares";
const documents = {
  intake: { send: "Enviar comprobante de ingreso", description: "ingreso" },
  delivery: { send: "Enviar pago y garant\u00eda", description: "pago y garant\u00eda" }
};

export function RepairDocumentShareActions({ order, canManageIntake }: { order: ShareOrder; canManageIntake: boolean }) {
  const helpId = useId();
  const phoneHelpId = useId();
  const [revoking, setRevoking] = useState<DocumentKind | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  if (!canManageIntake) return null;

  const phone = normalizeWhatsAppPhone(order.customer.phone || "");
  const hasValidPhone = /^549\d{10}$/.test(phone);
  const kinds: DocumentKind[] = order.pickedUpAt || order.deliveredAt ? ["intake", "delivery"] : ["intake"];

  async function revoke(kind: DocumentKind) {
    if (revoking || !window.confirm(`Cancelar todos los enlaces de ${documents[kind].description}? Los enlaces enviados dejaran de funcionar.`)) return;
    setRevoking(kind);
    setFeedback(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, kind, intent: "revoke" })
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Number.isInteger(data?.revoked) || data.revoked < 0) throw new Error();
      setFeedback({
        success: true,
        message: data.revoked
          ? `Se cancelaron ${data.revoked} enlaces de ${documents[kind].description}.`
          : `No habia enlaces activos de ${documents[kind].description}.`
      });
    } catch {
      setFeedback({ success: false, message: "No se pudieron cancelar los enlaces. Revisa la conexion e intenta nuevamente." });
    } finally {
      setRevoking(null);
    }
  }

  return <section aria-label="Comprobantes por WhatsApp" className="min-w-0 space-y-2 border-t border-slate-200 pt-3">
    <p className="break-words text-sm font-medium text-slate-800">Destinatario: {order.customer.fullName} - {order.customer.phone || "Sin telefono principal"}</p>
    <p className="text-xs leading-5 text-slate-600" id={helpId}>
      {"Usa la sesi\u00f3n de WhatsApp Web del local. Revis\u00e1 el destinatario y confirm\u00e1 Enviar."}
    </p>
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      {kinds.map((kind) => <form key={kind} method="post" action={endpoint} target="_blank" rel="noopener" className="min-w-0 sm:flex-1">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="intent" value="send" />
        <Button type="submit" variant="secondary" className="min-h-11 w-full whitespace-normal" disabled={!hasValidPhone || revoking !== null} aria-describedby={hasValidPhone ? helpId : `${helpId} ${phoneHelpId}`}>
          {documents[kind].send}
        </Button>
      </form>)}
    </div>
    {!hasValidPhone ? <p className="text-xs leading-5 text-amber-800" id={phoneHelpId}>El cliente no tiene un telefono principal valido para WhatsApp. Corregilo en Editar ingreso.</p> : null}
    <details className="min-w-0">
      <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40">Enlaces compartidos</summary>
      <div className="space-y-2 pb-2">
        <p className="text-xs leading-5 text-slate-500">
          {"Los enlaces vencen a los 365 d\u00edas. Cualquier persona con el enlace, incluso reenviado, puede ver solo ese comprobante, no la orden."}
        </p>
        <p className="text-xs leading-5 text-slate-500">{"La app no puede detectar si el mensaje fue entregado o le\u00eddo."}</p>
        <p className="text-xs leading-5 text-slate-500">Cancela todos los enlaces anteriores de ese comprobante.</p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          {kinds.map((kind) => <Button key={kind} type="button" variant="ghost" className="min-h-11 whitespace-normal" disabled={revoking !== null} onClick={() => void revoke(kind)}>
            {`Cancelar enlaces de ${documents[kind].description}`}
          </Button>)}
        </div>
        {revoking ? <p role="status" className="text-xs text-slate-600">Cancelando enlaces...</p> : null}
        {feedback ? <p role={feedback.success ? "status" : "alert"} className={`text-xs leading-5 ${feedback.success ? "text-emerald-800" : "text-rose-700"}`}>{feedback.message}</p> : null}
      </div>
    </details>
  </section>;
}
