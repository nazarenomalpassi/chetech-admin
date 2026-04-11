export const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nx", label: "NX" },
  { value: "mp", label: "MP" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" }
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
