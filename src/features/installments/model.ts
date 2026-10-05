type InstallmentPaymentMethod = string;

export type InstallmentStatus = "pendiente" | "pagada" | "vencida" | "cancelada";
export type InstallmentSaleStatus = "activa" | "finalizada" | "cancelada";

export type InstallmentDraft = {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paymentMethod: InstallmentPaymentMethod;
  status: "pendiente";
  notes: string;
};

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function addMonths(dateString: string, monthsToAdd: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const original = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || !Number.isFinite(original.getTime()) || original.toISOString().slice(0, 10) !== dateString) {
    throw new Error("Selecciona una fecha de vencimiento valida.");
  }
  const target = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function generateInstallments({
  totalAmount,
  installmentsCount,
  firstDueDate,
  paymentMethod
}: {
  totalAmount: number;
  installmentsCount: number;
  firstDueDate: string;
  paymentMethod: InstallmentPaymentMethod;
}) {
  const baseAmount = roundAmount(totalAmount / installmentsCount);
  let assignedTotal = 0;

  return Array.from({ length: installmentsCount }, (_, index) => {
    const installmentNumber = index + 1;
    const isLastInstallment = installmentNumber === installmentsCount;
    const amount = isLastInstallment
      ? roundAmount(totalAmount - assignedTotal)
      : baseAmount;

    assignedTotal = roundAmount(assignedTotal + amount);

    return {
      installmentNumber,
      dueDate: addMonths(firstDueDate, index),
      amount,
      paymentMethod,
      status: "pendiente" as const,
      notes: ""
    };
  });
}

export function resolveInstallmentStatus(
  status: Exclude<InstallmentStatus, "vencida"> | InstallmentStatus,
  dueDate: string,
  today: string
): InstallmentStatus {
  if (status === "pagada" || status === "cancelada") {
    return status;
  }

  return dueDate < today ? "vencida" : "pendiente";
}

export function getInstallmentSaleStatus(
  currentStatus: InstallmentSaleStatus,
  installments: Array<{ status: Exclude<InstallmentStatus, "vencida"> | InstallmentStatus; dueDate: string }>
) {
  if (currentStatus === "cancelada") {
    return "cancelada";
  }

  const hasOpenInstallment = installments.some((installment) => installment.status !== "pagada" && installment.status !== "cancelada");
  return hasOpenInstallment ? "activa" : "finalizada";
}
