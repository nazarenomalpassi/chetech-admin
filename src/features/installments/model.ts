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
  const date = new Date(year, month - 1, day, 12, 0, 0);
  date.setMonth(date.getMonth() + monthsToAdd);

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
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

  const hasOpenInstallment = installments.some((installment) => installment.status !== "pagada");
  return hasOpenInstallment ? "activa" : "finalizada";
}
