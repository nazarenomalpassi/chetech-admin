import { buttonVariants } from "@/components/ui/button";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import {
  buildRepairAccessWhatsAppHref,
  getRepairAccessWhatsAppTemplate,
  type RepairAccessWhatsAppKind,
  type RepairAccessWhatsAppOrder
} from "@/features/repairs-access/whatsapp";
import { cn } from "@/lib/utils";

function toWhatsAppOrder(order: RepairAccessOrderRecord): RepairAccessWhatsAppOrder {
  return {
    repairNumber: order.repairNumber,
    customerName: order.customer.fullName,
    phone: order.customer.phone || order.customer.alternatePhone,
    deviceLabel: [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - "),
    budgetAmount: order.budgetAmount,
    finalAmount: order.finalAmount,
    status: order.status,
    budgetDetail: order.budgetDetail,
    warrantyDays: order.warrantyDays
  };
}

export function RepairAccessWhatsAppButton({
  order,
  kind,
  size = "sm",
  variant = "secondary",
  label,
  className
}: {
  order: RepairAccessOrderRecord;
  kind?: RepairAccessWhatsAppKind;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "ghost";
  label?: string;
  className?: string;
}) {
  const whatsappOrder = toWhatsAppOrder(order);
  const template = getRepairAccessWhatsAppTemplate(whatsappOrder, kind);
  const href = buildRepairAccessWhatsAppHref(whatsappOrder, kind);

  if (!href) {
    return (
      <span
        className={cn(buttonVariants({ size, variant, className }), "cursor-not-allowed opacity-50")}
        title="El cliente no tiene un telefono valido para WhatsApp"
      >
        Sin WhatsApp
      </span>
    );
  }

  return (
    <a
      className={cn(buttonVariants({ size, variant, className }))}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={template.message}
    >
      {label ?? template.label}
    </a>
  );
}

export function RepairAccessWhatsAppPanel({ order }: { order: RepairAccessOrderRecord }) {
  const phone = order.customer.phone || order.customer.alternatePhone;

  return (
    <div className="mt-4 hidden border-t border-slate-200 pt-3 lg:block">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">WhatsApp del cliente</p>
          <p className="mt-1 text-sm text-slate-500">
            {phone ? `Mensaje preparado para ${phone}.` : "Carga un telefono para enviar avisos."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RepairAccessWhatsAppButton kind="budget" label="Presupuesto" order={order} variant="secondary" />
          <RepairAccessWhatsAppButton kind="ready" label="Listo para retirar" order={order} variant="secondary" />
          <RepairAccessWhatsAppButton kind="no_solution" label="Sin solucion" order={order} variant="secondary" />
          <RepairAccessWhatsAppButton kind="general" label="Mensaje general" order={order} variant="ghost" />
        </div>
      </div>
    </div>
  );
}
