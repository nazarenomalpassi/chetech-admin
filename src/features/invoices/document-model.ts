export type DocumentPayment = { amount: number | string; method?: string; paymentDate?: string };

const hundred = BigInt(100);
const maxCents = BigInt("999999999999");

// Match numeric(12,2) inputs without multiplying IEEE-754 money values.
function decimalHundredths(value: number | string) {
  const match = String(value).match(/^(\d{1,10})(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Importes invalidos: usa valores no negativos con hasta dos decimales.");
  const cents = BigInt(match[1]) * hundred + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > maxCents) throw new Error("El importe supera el limite del comprobante.");
  return cents;
}

export function calculateInvoiceAmounts(items: Array<{ quantity: number | string; unitPrice: number | string }>, discount: number | string = 0) {
  const lineCents = items.map((item) => {
    const cents = (decimalHundredths(item.quantity) * decimalHundredths(item.unitPrice) + BigInt(50)) / hundred;
    if (cents > maxCents) throw new Error("El importe del item supera el limite del comprobante.");
    return cents;
  });
  const subtotalCents = lineCents.reduce((sum, cents) => sum + cents, BigInt(0));
  if (subtotalCents > maxCents) throw new Error("El subtotal supera el limite del comprobante.");
  const discountCents = decimalHundredths(discount);
  if (discountCents > subtotalCents) throw new Error("El descuento no puede superar el subtotal.");
  return { lineTotals: lineCents.map((cents) => Number(cents) / 100), subtotal: Number(subtotalCents) / 100, discount: Number(discountCents) / 100, total: Number(subtotalCents - discountCents) / 100 };
}

export function deriveDocumentSettlement(total: number, payments: DocumentPayment[], voided = false) {
  const totalCents = decimalHundredths(total);
  const paidCents = payments.reduce((sum, payment) => sum + decimalHundredths(payment.amount), BigInt(0));
  if (paidCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Importes invalidos en el comprobante.");
  }
  return {
    paidTotal: Number(paidCents) / 100,
    balance: voided || paidCents >= totalCents ? 0 : Number(totalCents - paidCents) / 100,
    status: voided ? "anulado" : paidCents >= totalCents ? "pagado" : paidCents > BigInt(0) ? "parcial" : "pendiente"
  };
}
