// Reglas compartidas para preguntar, al cobrar, si el cliente ya retiró el equipo.
// Sin dependencias de servidor: lo usan los formularios y las acciones.

/** Estados desde los que `workshop_deliver` acepta registrar la entrega. */
export const PICKUP_STATUSES = [
  "listo_para_retirar",
  "no_presenta_fallas",
  "sin_solucion",
  "presupuestado_rechazado"
] as const;

export type PickupAnswer = "si" | "no";

export type PickupOrderState = {
  status?: string | null;
  deliveredAt?: string | null;
};

/** La orden está lista para entregar y todavía no tiene el retiro registrado. */
export function canRegisterPickup(order: PickupOrderState | null | undefined) {
  return Boolean(
    order &&
    !order.deliveredAt &&
    (PICKUP_STATUSES as readonly string[]).includes(order.status ?? "")
  );
}

/**
 * Se pregunta solo cuando el cobro salda la orden: una seña no implica retiro.
 * Los importes van en centavos para no comparar decimales.
 */
export function shouldAskPickup(
  order: PickupOrderState | null | undefined,
  balanceCents: number,
  paymentCents: number
) {
  return (
    canRegisterPickup(order) &&
    Number.isFinite(balanceCents) &&
    Number.isFinite(paymentCents) &&
    balanceCents > 0 &&
    paymentCents >= balanceCents
  );
}

export function readPickupAnswer(value: unknown): PickupAnswer | null {
  return value === "si" || value === "no" ? value : null;
}

export type PickupOutcome = "done" | "failed";

/** Mensaje de estado de Cobros según el resultado del retiro. */
export function getPaymentStatusCode(base: string, pickup: PickupOutcome | undefined) {
  if (pickup === "done") return `${base}_picked_up`;
  if (pickup === "failed") return "repair_payment_pickup_pending";
  return base;
}
