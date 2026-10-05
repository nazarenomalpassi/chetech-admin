import type { PaymentSplit } from "@/lib/payment-splits";
import { CASH_METHODS } from "@/lib/cash";

type RepairValidationInput = {
  amount: number;
  payments: PaymentSplit[];
};

export function getRepairValidationError(input: RepairValidationInput) {
  if (!Number.isFinite(input.amount) || input.amount < 0) return "Ingresa un precio valido.";
  if (input.payments.some((payment) => !CASH_METHODS.includes(payment.method as typeof CASH_METHODS[number]) || !Number.isFinite(payment.amount) || payment.amount <= 0)) {
    return "Revisa los importes y medios de pago.";
  }
  const paidCents = input.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  return paidCents > Math.round(input.amount * 100) ? "Los cobros no pueden superar el precio de la reparacion." : null;
}
