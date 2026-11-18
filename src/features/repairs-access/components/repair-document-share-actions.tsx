"use client";

import { useId, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RepairAccessOrderRecord } from "../queries";
import { normalizeWhatsAppPhone } from "../whatsapp";
import { confirmThen } from "@/components/ui/confirm-dialog";

type DocumentKind = "intake" | "delivery";
type ShareOrder = Pick<RepairAccessOrderRecord, "id" | "customer" | "pickedUpAt" | "deliveredAt">;

const endpoint = "/api/repair-access/document-shares";
const documents = {
  intake: { send: "Enviar comprobante de ingreso", description: "ingreso" },
  delivery: { send: "Enviar pago y garant\u00eda", description: "pago y garant\u00eda" }
};

export function RepairDocumentShareActions({
  order,
  canManageIntake
}: {
  order: ShareOrder;
  canManageIntake: boolean;
}) {
  const helpId = useId();
  const phoneHelpId = useId();
  const [revoking, setRevoking] = useState<DocumentKind | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  if (!canManageIntake) return null;

  const phone = normalizeWhatsAppPhone(order.customer.phone || "");
  const hasValidPhone = /^549\d{10}$/.test(phone);
  const kinds: DocumentKind[] =
    order.pickedUpAt || order.deliveredAt ? ["intake", "delivery"] : ["intake"];

  function revoke(kind: DocumentKind) {
    if (revoking) return;
    confirmThen(
      {
        title: `¿Cancelar los enlaces de ${documents[kind].description}?`,
        description: "Los enlaces que ya enviaste dejan de funcionar.",
        confirmLabel: "Cancelar enlaces",
        cancelLabel: "Volver",
        tone: "danger"
      },
      () => void runRevoke(kind)
    );
  }

  async function runRevoke(kind: DocumentKind) {
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
      setFeedback({
        success: false,
        message: "No se pudieron cancelar los enlaces. Revisa la conexion e intenta nuevamente."
      });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section
      aria-label="Comprobantes por WhatsApp"
      className="min-w-0 space-y-2 border-t border-border pt-3"
    >
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium wrap-break-word text-foreground">
            Destinatario: {order.customer.fullName} -{" "}
            {order.customer.phone || "Sin teléfono principal"}
          </p>
          <p className="text-xs leading-5 text-muted-foreground" id={helpId}>
            Se envía desde WhatsApp Web del local; confirmá Enviar.
          </p>
        </div>
        <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
          {kinds.map((kind) => (
            <form
              key={kind}
              method="post"
              action={endpoint}
              target="_blank"
              rel="noopener"
              className="min-w-0 sm:flex-1 lg:flex-none"
            >
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="intent" value="send" />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full whitespace-normal lg:w-auto"
                disabled={!hasValidPhone || revoking !== null}
                aria-describedby={hasValidPhone ? helpId : `${helpId} ${phoneHelpId}`}
              >
                <MessageCircle aria-hidden="true" className="h-4 w-4" />
                {documents[kind].send}
              </Button>
            </form>
          ))}
        </div>
      </div>
      {!hasValidPhone ? (
        <p className="text-xs leading-5 text-warning" id={phoneHelpId}>
          El cliente no tiene un teléfono principal válido para WhatsApp. Corregilo en Editar
          ingreso.
        </p>
      ) : null}
      <details className="min-w-0">
        <summary className="min-h-9 cursor-pointer rounded-lg py-2 text-sm font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden">
          Enlaces compartidos
        </summary>
        <div className="space-y-2 pb-2">
          <p className="text-xs leading-5 text-muted-foreground">
            {
              "Los enlaces vencen a los 365 d\u00edas. Cualquier persona con el enlace, incluso reenviado, puede ver solo ese comprobante, no la orden."
            }
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {"La app no puede detectar si el mensaje fue entregado o le\u00eddo."}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Cancela todos los enlaces anteriores de ese comprobante.
          </p>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
            {kinds.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                className="min-h-11 whitespace-normal"
                disabled={revoking !== null}
                onClick={() => void revoke(kind)}
              >
                {`Cancelar enlaces de ${documents[kind].description}`}
              </Button>
            ))}
          </div>
          {revoking ? (
            <p role="status" className="text-xs text-muted-foreground">
              Cancelando enlaces...
            </p>
          ) : null}
          {feedback ? (
            <p
              role={feedback.success ? "status" : "alert"}
              className={`text-xs leading-5 ${feedback.success ? "text-success" : "text-danger"}`}
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
