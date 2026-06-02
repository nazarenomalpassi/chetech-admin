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
        `Hola ${name}, te escribimos de Chetech por la orden ${order.repairNumber}.`,
        `Ya tenemos el presupuesto de tu ${device}${amount ? `: ${amount}` : "."}`,
        budgetDetail ? `Detalle: ${budgetDetail}.` : "",
        "Si estas de acuerdo, respondeme por aca para avanzar con la reparacion. Gracias."
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
        `Hola ${name}, te escribimos de Chetech por la orden ${order.repairNumber}.`,
        `Revisamos tu ${device} y por el momento no tiene solucion viable.`,
        "Cuando puedas, coordinamos el retiro del equipo. Gracias."
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
