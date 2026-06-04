import type { PaymentSplit } from "@/lib/payment-splits";

export function validatePaymentAllocation(totalAmount: number, payments: PaymentSplit[], emptyMessage: string) {
  if (totalAmount <= 0) return null;
  if (!payments.length) return emptyMessage;

  const assignedTotal = payments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
  if (Math.abs(assignedTotal - totalAmount) >= 0.01) {
    return `Los pagos cargados deben sumar exactamente ${totalAmount.toFixed(2)}.`;
  }

  return null;
}
