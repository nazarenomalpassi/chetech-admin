export type PaymentSplit = {
  amount: number;
  method: string;
};

export function parsePaymentSplits(value: FormDataEntryValue | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function roundPaymentAmount(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function getPaymentTotal(payments: PaymentSplit[]) {
  return roundPaymentAmount(payments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0));
}

export function paymentsMatchTotal(payments: PaymentSplit[], total: number) {
  return Math.abs(getPaymentTotal(payments) - roundPaymentAmount(total)) < 0.01;
}
