import { getCashMethodOptions } from "@/lib/cash";

export const PAYMENT_METHODS = getCashMethodOptions();

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
