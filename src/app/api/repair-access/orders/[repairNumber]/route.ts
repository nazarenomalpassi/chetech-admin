import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function normalizeRepairNumber(value: string) {
  const text = decodeURIComponent(value).trim().toUpperCase();
  const digitsOnly = text.match(/^\d+$/);
  if (digitsOnly) return `REP-${digitsOnly[0].padStart(6, "0")}`;

  const repNumber = text.match(/^REP[\s-]*(\d+)$/);
  if (repNumber?.[1]) return `REP-${repNumber[1].padStart(6, "0")}`;

  return text;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repairNumber: string }> }
) {
  await requireUser();

  const { repairNumber } = await params;
  const normalizedRepairNumber = normalizeRepairNumber(repairNumber);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json({
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
      issueDescription: data.issue_reported ?? "",
      amount: Number(data.final_amount || data.budget_amount || 0),
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
  });
}
