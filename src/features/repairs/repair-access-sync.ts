export function addDaysToDate(date: string, days: number) {
  if (days <= 0) return null;

  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function buildAccessPaidPayload({
  amount,
  paymentMethod,
  paymentNotes,
  userId,
  warrantyDays,
  nowIso = new Date().toISOString()
}: {
  amount: number;
  paymentMethod: string;
  paymentNotes: string | null;
  userId: string;
  warrantyDays: number;
  nowIso?: string;
}) {
  const today = nowIso.slice(0, 10);
  const warrantyUntil = addDaysToDate(today, warrantyDays);

  return {
    status: "retirado",
    final_amount: amount,
    payment_method: paymentMethod,
    payment_notes: paymentNotes,
    is_paid: true,
    paid_at: nowIso,
    picked_up_at: nowIso,
    delivered_at: nowIso,
    warranty_start: warrantyDays > 0 ? today : null,
    warranty_until: warrantyUntil,
    warranty_active: Boolean(warrantyUntil),
    updated_by: userId,
    updated_at: nowIso
  };
}

export function buildAccessUnpaidPayload({
  userId,
  nowIso = new Date().toISOString()
}: {
  userId: string;
  nowIso?: string;
}) {
  return {
    status: "listo_para_retirar",
    final_amount: null,
    payment_method: null,
    payment_notes: null,
    is_paid: false,
    paid_at: null,
    picked_up_at: null,
    delivered_at: null,
    warranty_start: null,
    warranty_until: null,
    warranty_active: false,
    updated_by: userId,
    updated_at: nowIso
  };
}
