import { toOperationalDateTime } from "@/lib/utils";
import { normalizeCashMethodValue } from "@/lib/cash";

type CashMovementType = "venta" | "reparacion" | "gasto" | "facturacion" | "sueldo";
type CashMethod = "efectivo" | "mp" | "nx";

export function normalizeAccountingMethod(method: string | null | undefined): CashMethod | null {
  return normalizeCashMethodValue(method);
}

export async function replaceCashMovement(
  supabase: any,
  payload: {
    tipo: CashMovementType;
    monto: number;
    medioPago: string;
    descripcion: string;
    referenciaTabla: string;
    referenciaId: string;
    userId?: string | null;
    fecha?: string | null;
  }
) {
  const medioPago = normalizeAccountingMethod(payload.medioPago);
  await supabase
    .from("movimientos_caja")
    .delete()
    .eq("referencia_tabla", payload.referenciaTabla)
    .eq("referencia_id", payload.referenciaId);

  if (!medioPago || payload.monto <= 0) return;

  const { error } = await supabase.from("movimientos_caja").insert({
    tipo: payload.tipo,
    monto: payload.monto,
    medio_pago: medioPago,
    descripcion: payload.descripcion,
    referencia_tabla: payload.referenciaTabla,
    referencia_id: payload.referenciaId,
    created_by: payload.userId ?? null,
    fecha: payload.fecha ? toOperationalDateTime(payload.fecha) : undefined
  });

  if (error && error.code !== "42P01") {
    throw error;
  }
}

export async function replaceCashMovements(
  supabase: any,
  payload: {
    tipo: CashMovementType;
    movimientos: { monto: number; medioPago: string; descripcion: string }[];
    referenciaTabla: string;
    referenciaId: string;
    userId?: string | null;
    fecha?: string | null;
  }
) {
  await supabase
    .from("movimientos_caja")
    .delete()
    .eq("referencia_tabla", payload.referenciaTabla)
    .eq("referencia_id", payload.referenciaId);

  const rows = payload.movimientos
    .map((movement) => ({
      tipo: payload.tipo,
      monto: movement.monto,
      medio_pago: normalizeAccountingMethod(movement.medioPago),
      descripcion: movement.descripcion,
      referencia_tabla: payload.referenciaTabla,
      referencia_id: payload.referenciaId,
      created_by: payload.userId ?? null,
      fecha: payload.fecha ? toOperationalDateTime(payload.fecha) : undefined
    }))
    .filter((row) => row.medio_pago && row.monto > 0);

  if (!rows.length) return;

  const { error } = await supabase.from("movimientos_caja").insert(rows);
  if (error && error.code !== "42P01") {
    throw error;
  }
}

export async function deleteCashMovement(supabase: any, referenciaTabla: string, referenciaId: string) {
  const { error } = await supabase
    .from("movimientos_caja")
    .delete()
    .eq("referencia_tabla", referenciaTabla)
    .eq("referencia_id", referenciaId);

  if (error && error.code !== "42P01") {
    throw error;
  }
}

export async function replaceStockMovement(
  supabase: any,
  payload: {
    productoId: string;
    tipo: "entrada" | "salida";
    cantidad: number;
    descripcion: string;
    referenciaTabla: string;
    referenciaId: string;
    userId?: string | null;
  }
) {
  await supabase
    .from("movimientos_stock")
    .delete()
    .eq("referencia_tabla", payload.referenciaTabla)
    .eq("referencia_id", payload.referenciaId);

  if (payload.cantidad <= 0) return;

  const { error } = await supabase.from("movimientos_stock").insert({
    producto_id: payload.productoId,
    tipo: payload.tipo,
    cantidad: payload.cantidad,
    descripcion: payload.descripcion,
    referencia_tabla: payload.referenciaTabla,
    referencia_id: payload.referenciaId,
    created_by: payload.userId ?? null
  });

  if (error && error.code !== "42P01") {
    throw error;
  }
}

export async function replaceStockMovements(
  supabase: any,
  payload: {
    movimientos: { productoId: string; tipo: "entrada" | "salida"; cantidad: number; descripcion: string }[];
    referenciaTabla: string;
    referenciaId: string;
    userId?: string | null;
  }
) {
  await supabase
    .from("movimientos_stock")
    .delete()
    .eq("referencia_tabla", payload.referenciaTabla)
    .eq("referencia_id", payload.referenciaId);

  const rows = payload.movimientos
    .filter((movement) => movement.cantidad > 0)
    .map((movement) => ({
      producto_id: movement.productoId,
      tipo: movement.tipo,
      cantidad: movement.cantidad,
      descripcion: movement.descripcion,
      referencia_tabla: payload.referenciaTabla,
      referencia_id: payload.referenciaId,
      created_by: payload.userId ?? null
    }));

  if (!rows.length) return;

  const { error } = await supabase.from("movimientos_stock").insert(rows);
  if (error && error.code !== "42P01") {
    throw error;
  }
}

export async function deleteStockMovement(supabase: any, referenciaTabla: string, referenciaId: string) {
  const { error } = await supabase
    .from("movimientos_stock")
    .delete()
    .eq("referencia_tabla", referenciaTabla)
    .eq("referencia_id", referenciaId);

  if (error && error.code !== "42P01") {
    throw error;
  }
}
