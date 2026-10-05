export function addDaysToDate(date: string, days: number) {
  if (days <= 0) return null;

  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function buildAccessPaidPayload({
  paymentMethod,
  paymentNotes,
  userId,
  nowIso = new Date().toISOString()
}: {
  amount: number;
  paymentMethod: string;
  paymentNotes: string | null;
  userId: string;
  warrantyDays: number;
  nowIso?: string;
}) {
  // Payment confirmation is not physical delivery or a new warranty period.
  return {
    payment_method: paymentMethod,
    payment_notes: paymentNotes,
    is_paid: true,
    paid_at: nowIso,
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
    payment_method: null,
    payment_notes: null,
    is_paid: false,
    paid_at: null,
    updated_by: userId,
    updated_at: nowIso
  };
}
