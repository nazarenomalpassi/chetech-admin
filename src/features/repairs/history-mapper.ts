import { normalizeCashMethodValue } from "@/lib/cash";

type RawRepairPayment = {
  method: string | null;
  amount: number | string | null;
  created_at?: string | null;
};

function readRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getLatestPaymentMethod(payments: RawRepairPayment[]) {
  if (!payments.length) return "";

  const latestPayment = [...payments].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
  )[0];

  return normalizeCashMethodValue(latestPayment?.method) ?? latestPayment?.method ?? "";
}

export function mapRepairsHistoryRows(rows: any[]) {
  return rows.map((repair) => {
    const payments = ((repair.repair_payments ?? []) as RawRepairPayment[]).map((payment) => ({
      method: normalizeCashMethodValue(payment.method) ?? payment.method ?? "",
      amount: Number(payment.amount),
      created_at: payment.created_at
    }));

    return {
      id: repair.id,
      repairAccessOrderId: repair.repair_access_order_id ?? null,
      repairAccessOrderNumber: readRelated(repair.repair_access_orders)?.repair_number ?? "",
      customerName: repair.customer_name,
      customerPhone: repair.customer_phone ?? "",
      device: repair.device,
      orderNumber: repair.order_number ?? null,
      issueDescription: repair.issue_description ?? "",
      finalPrice: Number(repair.final_price ?? 0),
      estimatedPrice: Number(repair.estimated_price ?? 0),
      status: repair.status,
      observations: repair.observations ?? null,
      entryDate: repair.entry_date ?? String(repair.created_at ?? "").slice(0, 10),
      createdAt: repair.created_at,
      paymentMethod: getLatestPaymentMethod(payments),
      payments
    };
  });
}
