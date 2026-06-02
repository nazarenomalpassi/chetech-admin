export const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nx", label: "NX SANTI" },
  { value: "mp", label: "NX LOCAL" }
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
