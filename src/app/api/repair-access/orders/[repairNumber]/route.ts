import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRepairFinancialRecordByNativeId, normalizeRepairCollectionNumber } from "@/features/repairs/queries";
import { mapPrimaryOrderOption } from "@/features/invoices/primary-order-mapper";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repairNumber: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Necesitas iniciar sesion para consultar la orden." }, { status: 401 });
  }

  const { repairNumber } = await params;
  const normalizedRepairNumber = normalizeRepairCollectionNumber(repairNumber);
  if (!normalizedRepairNumber) {
    return NextResponse.json({ error: "Ingresa un numero de orden valido." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repair_access_orders")
    .select(
      `
        id,
        repair_number,
        issue_reported,
        status,
        intake_date,
        budget_amount,
        approved_amount,
        budget_detail,
        final_amount,
        payment_method,
        payment_notes,
        warranty_days,
        warranty_start,
        warranty_until,
        warranty_conditions,
        repair_access_customers (
          full_name,
          phone,
          alternate_phone,
          dni,
          email,
          address,
          notes
        ),
        repair_access_devices (
          device_type,
          brand,
          model,
          serial_number,
          accessory_details,
          visual_condition
        )
      `
    )
    .eq("repair_number", normalizedRepairNumber)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "No se pudo consultar la orden de reparacion." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ order: null }, { status: 404 });
  }

  const customer = Array.isArray(data.repair_access_customers)
    ? data.repair_access_customers[0]
    : data.repair_access_customers;
  const device = Array.isArray(data.repair_access_devices)
    ? data.repair_access_devices[0]
    : data.repair_access_devices;
  let financialRecord;
  try { financialRecord = await getRepairFinancialRecordByNativeId(data.id, supabase); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Revisa el registro financiero vinculado." }, { status: 409, headers: { "Cache-Control": "private, no-store" } }); }

  return NextResponse.json({
    financialRecord,
    order: {
      id: data.id,
      repairNumber: data.repair_number,
      status: data.status,
      intakeDate: data.intake_date,
      customerName: customer?.full_name ?? "",
      customerPhone: customer?.phone ?? "",
      customerAlternatePhone: customer?.alternate_phone ?? "",
      customerDni: customer?.dni ?? "",
      customerEmail: customer?.email ?? "",
      customerAddress: customer?.address ?? "",
      device: [device?.device_type, device?.brand, device?.model].filter(Boolean).join(" - "),
      issueDescription: data.budget_detail || data.issue_reported || "",
      amount: mapPrimaryOrderOption(data).amount,
      paymentMethod: data.payment_method ?? "",
      paymentNotes: data.payment_notes ?? "",
      warrantyDays: Number(data.warranty_days ?? 0),
      warrantyStart: data.warranty_start ?? "",
      warrantyUntil: data.warranty_until ?? "",
      warrantyConditions: data.warranty_conditions ?? "",
      observations: [
        `Orden Access: ${data.repair_number}`,
        customer?.phone ? `Telefono: ${customer.phone}` : "",
        customer?.dni ? `DNI: ${customer.dni}` : "",
        customer?.address ? `Direccion: ${customer.address}` : "",
        device?.serial_number ? `Serie: ${device.serial_number}` : "",
        device?.accessory_details ? `Accesorios: ${device.accessory_details}` : "",
        data.payment_notes ? `Cobro informado en ficha: ${data.payment_notes}` : "",
        data.warranty_conditions ? `Garantia: ${data.warranty_conditions}` : ""
      ].filter(Boolean).join("\n")
    }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
