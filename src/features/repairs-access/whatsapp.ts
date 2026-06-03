import { formatCurrency } from "@/lib/utils";

export type RepairAccessWhatsAppKind = "general" | "budget" | "ready" | "no_solution";

export type RepairAccessWhatsAppOrder = {
  repairNumber: string;
  customerName: string;
  phone: string;
  deviceLabel: string;
  budgetAmount: number;
  finalAmount: number;
  status: string;
  budgetDetail?: string | null;
  warrantyDays?: number | null;
};

export type RepairAccessWhatsAppTemplate = {
  kind: RepairAccessWhatsAppKind;
  label: string;
  message: string;
};

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "como estas";
}

function customerGreeting() {
  return "Hola buen dia, le hablamos de parte de Chetech.";
}

function formatAmount(amount: number) {
  return amount > 0 ? formatCurrency(amount) : "";
}

function getAmount(order: RepairAccessWhatsAppOrder) {
  return order.finalAmount > 0 ? order.finalAmount : order.budgetAmount;
}

export function normalizeWhatsAppPhone(phone: string) {
  let digits = phone.replace(/\D+/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);

  if (digits.startsWith("549") && digits.length >= 12) return digits;

  if (digits.startsWith("54")) {
    const nationalNumber = digits.slice(2);
    if (!nationalNumber.startsWith("9") && nationalNumber.length >= 10) {
      return `549${nationalNumber}`;
    }

    return digits.length >= 12 ? digits : "";
  }

  if (digits.length === 10) return `549${digits}`;

  return "";
}

export function getRepairAccessWhatsAppTemplate(
  order: RepairAccessWhatsAppOrder,
  kind?: RepairAccessWhatsAppKind
): RepairAccessWhatsAppTemplate {
  const selectedKind = kind ?? getDefaultWhatsAppKind(order.status);
  const name = firstName(order.customerName);
  const device = order.deviceLabel || "equipo";
  const amount = formatAmount(getAmount(order));
  const budgetDetail = order.budgetDetail?.trim();
  const warrantyText = order.warrantyDays ? ` Tiene ${order.warrantyDays} dias de garantia desde el retiro.` : "";

  if (selectedKind === "budget") {
    return {
      kind: "budget",
      label: "Enviar presupuesto",
      message: [
        customerGreeting(),
        `Le paso el presupuesto de la reparacion de su equipo ${device}.`,
        budgetDetail ? `${budgetDetail}.` : "",
        amount ? `le saldria ${amount}.` : "",
        `tiene de garantia ${order.warrantyDays || 0} dias.`
      ].filter(Boolean).join(" ")
    };
  }

  if (selectedKind === "ready") {
    return {
      kind: "ready",
      label: "Avisar listo",
      message: [
        `Hola ${name}, te escribimos de Chetech por la orden ${order.repairNumber}.`,
        `Tu ${device} ya esta listo para retirar.`,
        amount ? `Total: ${amount}.` : "",
        `${warrantyText} Te esperamos en el local. Gracias.`
      ].filter(Boolean).join(" ")
    };
  }

  if (selectedKind === "no_solution") {
    return {
      kind: "no_solution",
      label: "Avisar sin solucion",
      message: [
        customerGreeting().replace("le hablamos", "le hablo"),
        `lamentamos informarle que su equipo ${device} no va a tener reparacion.`
      ].join(" ")
    };
  }

  return {
    kind: "general",
    label: "WhatsApp",
    message: [
      `Hola ${name}, te escribimos de Chetech por la orden ${order.repairNumber}.`,
      `Queremos avisarte novedades sobre tu ${device}.`,
      "Respondeme por aca cuando puedas. Gracias."
    ].join(" ")
  };
}

export function buildRepairAccessWhatsAppHref(
  order: RepairAccessWhatsAppOrder,
  kind?: RepairAccessWhatsAppKind
) {
  const phone = normalizeWhatsAppPhone(order.phone);
  if (!phone) return null;

  const template = getRepairAccessWhatsAppTemplate(order, kind);
  return `https://wa.me/${phone}?text=${encodeURIComponent(template.message)}`;
}

export function getDefaultWhatsAppKind(status: string): RepairAccessWhatsAppKind {
  if (status === "presupuestado") return "budget";
  if (status === "listo_para_retirar" || status === "retirado") return "ready";
  if (status === "sin_solucion") return "no_solution";
  return "general";
}
