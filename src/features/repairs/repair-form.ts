import { PAYMENT_METHODS } from "@/lib/payment-methods";

export type RepairListRecord = {
  id: string;
  repairAccessOrderId: string | null;
  repairAccessOrderNumber: string;
  customerName: string;
  customerPhone: string;
  device: string;
  issueDescription: string;
  finalPrice: number;
  estimatedPrice: number;
  paymentMethod: string;
  status: string;
  observations: string | null;
  createdAt: string;
};

export type RepairFormValues = {
  id: string;
  repairAccessOrderId: string;
  accessOrderNumber: string;
  customerName: string;
  customerPhone: string;
  device: string;
  issueDescription: string;
  status: string;
  amount: string;
  paymentMethod: string;
  observations: string;
};

export function canUsePaymentMethod(value: string) {
  return PAYMENT_METHODS.some((method) => method.value === value);
}

export function buildRepairFormFromRepair(repair: RepairListRecord): RepairFormValues {
  return {
    id: repair.id,
    repairAccessOrderId: repair.repairAccessOrderId ?? "",
    accessOrderNumber: repair.repairAccessOrderNumber ?? "",
    customerName: repair.customerName,
    customerPhone: repair.customerPhone ?? "",
    device: repair.device,
    issueDescription: repair.issueDescription,
    status: repair.status,
    amount: String(repair.finalPrice || repair.estimatedPrice || ""),
    paymentMethod: canUsePaymentMethod(repair.paymentMethod) ? repair.paymentMethod : "efectivo",
    observations: repair.observations ?? ""
  };
}
