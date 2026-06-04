import type { PaymentSplit } from "@/lib/payment-splits";
import { validatePaymentAllocation } from "@/lib/payment-validation";

type SaleValidationInput = {
  itemCount: number;
  totalAmount: number;
  payments: PaymentSplit[];
};

export function getSaleValidationError(input: SaleValidationInput) {
  if (input.itemCount <= 0) {
    return "Agrega al menos un producto";
  }

  return validatePaymentAllocation(
    input.totalAmount,
    input.payments,
    "Agrega al menos un medio de pago para registrar la venta."
  );
}
