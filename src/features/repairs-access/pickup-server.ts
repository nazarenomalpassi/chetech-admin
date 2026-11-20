import { z } from "zod";
import { canRegisterPickup, PICKUP_STATUSES } from "./pickup";

const pickupOrderSchema = z.object({
  id: z.string().uuid(),
  repair_number: z.string().nullable().optional(),
  status: z.string(),
  is_paid: z.boolean().nullable(),
  delivered_at: z.string().nullable(),
  workflow_version: z.number().int().nullable(),
  repair_access_customers: z
    .union([
      z.object({ full_name: z.string().nullable() }),
      z.array(z.object({ full_name: z.string().nullable() }))
    ])
    .nullable()
    .optional()
});

export type PickupResult = { success: boolean; message: string; repairNumber?: string };

function customerName(value: z.infer<typeof pickupOrderSchema>["repair_access_customers"]) {
  const customer = Array.isArray(value) ? value[0] : value;
  const name = customer?.full_name?.trim() ?? "";
  return name.length >= 2 ? name.slice(0, 200) : "Cliente";
}

// Solo se importa desde acciones de servidor ("use server").

/**
 * Registra el retiro de una orden ya cobrada con la misma función atómica que usa
 * "Registrar entrega" (`workshop_deliver`): cambia el estado a retirado, guarda la
 * fecha, el historial y la auditoría. Lee la versión justo antes porque el cobro
 * acaba de actualizar la orden.
 */
export async function registerPickupForPaidOrder(
  supabase: any,
  orderId: string,
  notes: string
): Promise<PickupResult> {
  const read = await supabase
    .from("repair_access_orders")
    .select(
      "id,repair_number,status,is_paid,delivered_at,workflow_version,repair_access_customers(full_name)"
    )
    .eq("id", orderId)
    .maybeSingle();
  const parsed = pickupOrderSchema.safeParse(read.data);
  if (read.error || !parsed.success)
    return { success: false, message: "No se pudo leer la orden para marcar el retiro." };
  const order = parsed.data;
  const repairNumber = order.repair_number ?? undefined;
  if (order.delivered_at)
    return { success: true, message: "El retiro ya estaba registrado.", repairNumber };
  if (!canRegisterPickup({ status: order.status }))
    return {
      success: false,
      message: "La orden todavía no está lista para entregar.",
      repairNumber
    };
  if (!order.is_paid)
    return {
      success: false,
      message: "La orden todavía figura con saldo pendiente.",
      repairNumber
    };
  if (order.workflow_version === null)
    return { success: false, message: "La orden no tiene versión de taller.", repairNumber };
  const result = await supabase.rpc("workshop_deliver", {
    p_order_id: order.id,
    p_expected_version: order.workflow_version,
    p_recipient: customerName(order.repair_access_customers),
    p_notes: notes,
    p_allow_balance: false
  });
  if (result.error)
    return {
      success: false,
      message: result.error.message || "No se pudo registrar el retiro.",
      repairNumber
    };
  return { success: true, message: "Retiro registrado.", repairNumber };
}

export type PaidOrderAwaitingPickup = {
  id: string;
  repairNumber: string;
  customerName: string;
  device: string;
  paidAt: string | null;
  intakeDate: string | null;
};

const MAX_AWAITING_PICKUP = 200;

/** Órdenes cobradas, listas para entregar y sin retiro registrado. */
export async function listPaidOrdersAwaitingPickup(
  supabase: any
): Promise<PaidOrderAwaitingPickup[]> {
  const result = await supabase
    .from("repair_access_orders")
    .select(
      "id,repair_number,paid_at,intake_date,repair_access_customers(full_name),repair_access_devices(device_type,brand,model)"
    )
    .eq("is_paid", true)
    .is("delivered_at", null)
    .in("status", [...PICKUP_STATUSES])
    .order("paid_at", { ascending: true, nullsFirst: false })
    .order("repair_number", { ascending: true })
    .limit(MAX_AWAITING_PICKUP);
  if (result.error) throw new Error("No se pudieron leer las órdenes cobradas sin retiro.");
  return (result.data ?? []).map((row: any) => {
    const customer = Array.isArray(row.repair_access_customers)
      ? row.repair_access_customers[0]
      : row.repair_access_customers;
    const device = Array.isArray(row.repair_access_devices)
      ? row.repair_access_devices[0]
      : row.repair_access_devices;
    return {
      id: String(row.id),
      repairNumber: String(row.repair_number ?? ""),
      customerName: customer?.full_name?.trim() || "Sin nombre",
      device:
        [device?.device_type, device?.brand, device?.model].filter(Boolean).join(" ") ||
        "Equipo sin datos",
      paidAt: row.paid_at ?? null,
      intakeDate: row.intake_date ?? null
    };
  });
}
