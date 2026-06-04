"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { deleteCashMovement, replaceCashMovement } from "@/lib/accounting";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toOperationalDateTime } from "@/lib/utils";
import { getInstallmentSaleStatus } from "@/features/installments/model";

const paymentMethodSchema = z.enum(["efectivo", "nx", "mp"], {
  message: "Selecciona un medio de pago valido"
});

const installmentSchema = z.object({
  installmentNumber: z.coerce.number().int().positive("La cuota debe tener un numero valido"),
  dueDate: z.string().min(1, "Cada cuota debe tener fecha de vencimiento"),
  amount: z.coerce.number().positive("Cada cuota debe tener un monto valido"),
  paymentMethod: paymentMethodSchema,
  notes: z.string().optional()
});

const installmentSaleSchema = z.object({
  productName: z.string().min(1, "Ingresa el producto"),
  customerName: z.string().min(1, "Ingresa el cliente"),
  totalAmount: z.coerce.number().positive("El monto total debe ser mayor a 0"),
  installmentsCount: z.coerce.number().int().min(1, "La cantidad de cuotas debe ser al menos 1"),
  notes: z.string().optional(),
  installments: z.array(installmentSchema).min(1, "Genera al menos una cuota")
});

const updateInstallmentSchema = z.object({
  id: z.string().uuid(),
  dueDate: z.string().min(1, "La cuota debe tener fecha de vencimiento"),
  amount: z.coerce.number().positive("La cuota debe tener un monto valido"),
  paymentMethod: paymentMethodSchema,
  notes: z.string().optional()
});

const markInstallmentPaidSchema = z.object({
  id: z.string().uuid(),
  paymentMethod: paymentMethodSchema,
  paidDate: z.string().min(1, "Selecciona la fecha de cobro")
});

function parseInstallments(value: FormDataEntryValue | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function redirectWithError(message: string): never {
  redirect(`/cuotas?error=${encodeURIComponent(message)}` as Route);
}

async function getInstallmentRecord(supabase: any, id: string) {
  const installmentResult = await (supabase as any)
    .from("installments")
    .select("id, installment_sale_id, installment_number, due_date, amount, payment_method, status, paid_at, notes")
    .eq("id", id)
    .single();

  if (installmentResult.error || !installmentResult.data) {
    throw new Error(installmentResult.error?.message ?? "No se encontro la cuota.");
  }

  const saleResult = await (supabase as any)
    .from("installment_sales")
    .select("id, product_name, customer_name, installments_count, status")
    .eq("id", installmentResult.data.installment_sale_id)
    .single();

  if (saleResult.error || !saleResult.data) {
    throw new Error(saleResult.error?.message ?? "No se encontro la venta en cuotas.");
  }

  return {
    installment: installmentResult.data,
    sale: saleResult.data
  };
}

async function syncInstallmentSaleStatus(supabase: any, saleId: string) {
  const saleResult = await (supabase as any)
    .from("installment_sales")
    .select("status")
    .eq("id", saleId)
    .single();

  if (saleResult.error || !saleResult.data) {
    throw new Error(saleResult.error?.message ?? "No se pudo leer la venta en cuotas.");
  }

  if (saleResult.data.status === "cancelada") {
    return "cancelada";
  }

  const installmentsResult = await (supabase as any)
    .from("installments")
    .select("status, due_date")
    .eq("installment_sale_id", saleId);

  if (installmentsResult.error) {
    throw new Error(installmentsResult.error.message);
  }

  const nextStatus = getInstallmentSaleStatus(
    saleResult.data.status,
    (installmentsResult.data ?? []).map((installment: any) => ({
      status: installment.status,
      dueDate: installment.due_date
    }))
  );

  await (supabase as any)
    .from("installment_sales")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", saleId);

  return nextStatus;
}

function buildInstallmentDescription(sale: { customer_name: string; product_name: string }, installment: { installment_number: number }, installmentsCount: number) {
  return `Cuota ${installment.installment_number}/${installmentsCount} - ${sale.customer_name} - ${sale.product_name}`;
}

export async function saveInstallmentSaleAction(formData: FormData) {
  const parsed = installmentSaleSchema.safeParse({
    productName: formData.get("productName"),
    customerName: formData.get("customerName"),
    totalAmount: formData.get("totalAmount"),
    installmentsCount: formData.get("installmentsCount"),
    notes: formData.get("notes"),
    installments: parseInstallments(formData.get("installmentsJson"))
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la venta en cuotas.");
  }

  if (parsed.data.installments.length !== parsed.data.installmentsCount) {
    redirectWithError("La cantidad de cuotas no coincide con el detalle generado.");
  }

  const installmentsTotal = roundAmount(
    parsed.data.installments.reduce((acc, installment) => acc + Number(installment.amount), 0)
  );

  if (Math.abs(installmentsTotal - roundAmount(parsed.data.totalAmount)) >= 0.01) {
    redirectWithError("La suma de las cuotas debe coincidir con el monto total.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const salePayload = {
    product_name: parsed.data.productName,
    customer_name: parsed.data.customerName,
    total_amount: parsed.data.totalAmount,
    installments_count: parsed.data.installmentsCount,
    notes: parsed.data.notes || null,
    status: "activa",
    created_by: user.id
  };

  const saleResult = await (supabase as any)
    .from("installment_sales")
    .insert(salePayload)
    .select("id")
    .single();

  if (saleResult.error || !saleResult.data) {
    redirectWithError(saleResult.error?.message ?? "No se pudo crear la venta en cuotas.");
  }

  const installmentsResult = await (supabase as any).from("installments").insert(
    parsed.data.installments.map((installment) => ({
      installment_sale_id: saleResult.data.id,
      installment_number: installment.installmentNumber,
      due_date: installment.dueDate,
      amount: installment.amount,
      payment_method: installment.paymentMethod,
      status: "pendiente",
      notes: installment.notes || null
    }))
  );

  if (installmentsResult.error) {
    redirectWithError(installmentsResult.error.message);
  }

  await createAuditLog({
    entityType: "installment_sales",
    entityId: saleResult.data.id,
    action: "insert",
    userId: user.id,
    changes: {
      ...salePayload,
      installments: parsed.data.installments
    }
  });

  revalidatePath("/cuotas");
  revalidatePath("/dashboard");
  redirect("/cuotas?status=installment_sale_created" as Route);
}

export async function updateInstallmentAction(formData: FormData) {
  const parsed = updateInstallmentSchema.safeParse({
    id: formData.get("id"),
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar la cuota.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { installment, sale } = await getInstallmentRecord(supabase as any, parsed.data.id);
  const payload = {
    due_date: parsed.data.dueDate,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    notes: parsed.data.notes || null,
    updated_at: new Date().toISOString()
  };

  const updateResult = await (supabase as any)
    .from("installments")
    .update(payload)
    .eq("id", parsed.data.id);

  if (updateResult.error) {
    redirectWithError(updateResult.error.message);
  }

  if (installment.status === "pagada" && installment.paid_at) {
    await replaceCashMovement(supabase as any, {
      tipo: "venta",
      monto: parsed.data.amount,
      medioPago: parsed.data.paymentMethod,
      descripcion: buildInstallmentDescription(sale, installment, Number(sale.installments_count)),
      referenciaTabla: "installments",
      referenciaId: installment.id,
      userId: user.id,
      fecha: installment.paid_at.slice(0, 10)
    });
  }

  await syncInstallmentSaleStatus(supabase as any, sale.id);

  await createAuditLog({
    entityType: "installments",
    entityId: installment.id,
    action: "update",
    userId: user.id,
    changes: payload
  });

  revalidatePath("/cuotas");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/cuotas?status=installment_updated" as Route);
}

export async function markInstallmentPaidAction(formData: FormData) {
  const parsed = markInstallmentPaidSchema.safeParse({
    id: formData.get("id"),
    paymentMethod: formData.get("paymentMethod"),
    paidDate: formData.get("paidDate")
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "No se pudo validar el cobro de la cuota.");
  }

  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { installment, sale } = await getInstallmentRecord(supabase as any, parsed.data.id);

  const updateResult = await (supabase as any)
    .from("installments")
    .update({
      status: "pagada",
      payment_method: parsed.data.paymentMethod,
      paid_at: toOperationalDateTime(parsed.data.paidDate),
      updated_at: new Date().toISOString()
    })
    .eq("id", parsed.data.id);

  if (updateResult.error) {
    redirectWithError(updateResult.error.message);
  }

  await replaceCashMovement(supabase as any, {
    tipo: "venta",
    monto: Number(installment.amount),
    medioPago: parsed.data.paymentMethod,
    descripcion: buildInstallmentDescription(sale, installment, Number(sale.installments_count)),
    referenciaTabla: "installments",
    referenciaId: installment.id,
    userId: user.id,
    fecha: parsed.data.paidDate
  });

  await syncInstallmentSaleStatus(supabase as any, sale.id);

  await createAuditLog({
    entityType: "installments",
    entityId: installment.id,
    action: "update",
    userId: user.id,
    changes: {
      status: "pagada",
      payment_method: parsed.data.paymentMethod,
      paid_at: parsed.data.paidDate
    }
  });

  revalidatePath("/cuotas");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/cuotas?status=installment_paid" as Route);
}

export async function cancelInstallmentAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { installment, sale } = await getInstallmentRecord(supabase as any, id);

  if (installment.status === "pagada") {
    redirectWithError("No se puede cancelar una cuota ya pagada.");
  }

  const updateResult = await (supabase as any)
    .from("installments")
    .update({
      status: "cancelada",
      paid_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (updateResult.error) {
    redirectWithError(updateResult.error.message);
  }

  await deleteCashMovement(supabase as any, "installments", id);
  await syncInstallmentSaleStatus(supabase as any, sale.id);

  await createAuditLog({
    entityType: "installments",
    entityId: id,
    action: "update",
    userId: user.id,
    changes: { status: "cancelada" }
  });

  revalidatePath("/cuotas");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  redirect("/cuotas?status=installment_cancelled" as Route);
}

export async function cancelInstallmentSaleAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await requireAdmin();
  const supabase = await createServerSupabaseClient();

  const saleUpdateResult = await (supabase as any)
    .from("installment_sales")
    .update({
      status: "cancelada",
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (saleUpdateResult.error) {
    redirectWithError(saleUpdateResult.error.message);
  }

  const installmentsUpdateResult = await (supabase as any)
    .from("installments")
    .update({
      status: "cancelada",
      updated_at: new Date().toISOString()
    })
    .eq("installment_sale_id", id)
    .neq("status", "pagada");

  if (installmentsUpdateResult.error) {
    redirectWithError(installmentsUpdateResult.error.message);
  }

  await createAuditLog({
    entityType: "installment_sales",
    entityId: id,
    action: "update",
    userId: user.id,
    changes: { status: "cancelada" }
  });

  revalidatePath("/cuotas");
  revalidatePath("/dashboard");
  redirect("/cuotas?status=installment_sale_cancelled" as Route);
}
