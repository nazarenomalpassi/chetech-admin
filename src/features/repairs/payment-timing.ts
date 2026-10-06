import { getLocalDateInputValue } from "@/lib/utils";

export function readRepairPaymentTiming(value: unknown, suppliedTimestamp?: unknown) {
  const raw = String(value ?? "");
  const timestamp = suppliedTimestamp ? String(suppliedTimestamp) : raw.includes("T") ? raw : undefined;
  const parsed = timestamp ? new Date(timestamp) : null;
  return {
    paymentDate: raw.includes("T") && parsed && Number.isFinite(parsed.getTime()) ? getLocalDateInputValue(parsed) : raw,
    paymentTimestamp: timestamp
  };
}
