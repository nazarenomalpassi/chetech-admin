import { getPartOutstandingQuantity, type WorkshopOrderContext } from "../workflow";

export function ReadyForPickupRequirements({ workflow, status, canManage }: {
  workflow?: WorkshopOrderContext;
  status: string;
  canManage: boolean;
}) {
  if (!workflow || ["listo_para_retirar", "retirado", "sin_solucion", "presupuestado_rechazado"].includes(status)) return null;
  const pendingParts = workflow.parts.some((part) => getPartOutstandingQuantity(part) > 0);

  return <div role="note" aria-label="Antes de marcar listo para retirar" className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
    <p className="font-semibold">Antes de marcar listo para retirar</p>
    <ul className="mt-3 space-y-3 leading-5">
      <li>
        <p className="font-medium">{workflow.approvalStatus === "accepted" ? "Confirmacion del cliente registrada" : "Confirmacion del cliente pendiente"}</p>
        {workflow.approvalStatus !== "accepted" ? <p className="mt-1 text-amber-900">{canManage ? 'Usa "Cliente confirmo" en la coordinacion de esta orden si el cliente ya autorizo el presupuesto.' : 'Pedile a mostrador que registre "Cliente confirmo" para este presupuesto.'}</p> : null}
      </li>
      <li>
        <p className="font-medium">{workflow.qualityCheckedAt ? "Control de calidad registrado" : "Control de calidad pendiente"}</p>
        {!workflow.qualityCheckedAt ? <p className="mt-1 text-amber-900">Despues de probar el equipo, marca la casilla de control de calidad de este formulario al guardar.</p> : null}
      </li>
      {pendingParts ? <li>
        <p className="font-medium">Repuestos pendientes de recibir</p>
        <p className="mt-1 text-amber-900">Mostrador debe completar la recepcion de las cantidades pendientes o cancelar las solicitudes que no correspondan.</p>
      </li> : null}
    </ul>
    <p className="mt-3 text-xs leading-5 text-amber-900">Si cambia el presupuesto o su detalle, se necesita una nueva confirmacion. Guardar no autoriza al cliente ni registra un cobro.</p>
  </div>;
}
