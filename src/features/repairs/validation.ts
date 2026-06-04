import type { PaymentSplit } from "@/lib/payment-splits";
import { validatePaymentAllocation } from "@/lib/payment-validation";

type RepairValidationInput = {
  amount: number;
  payments: PaymentSplit[];
};

export function getRepairValidationError(input: RepairValidationInput) {
  return validatePaymentAllocation(
    input.amount,
    input.payments,
    "Agrega al menos un medio de pago para registrar la reparación."
  );
}
