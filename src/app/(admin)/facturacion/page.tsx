import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InvoicesView } from "@/features/invoices/components/invoices-view";
import { getInvoiceById, getInvoiceFormOptions, getInvoices } from "@/features/invoices/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { parsePage } from "@/lib/pagination";

export default async function FacturacionPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; edit?: string; page?: string; order?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("invoices.manage");
  const requestedOrder = z.string().uuid().safeParse(params.order);
  const initialPrimaryOrderId = requestedOrder.success ? requestedOrder.data : undefined;
  const editingInvoice = params.edit ? await getInvoiceById(params.edit) : null;
  const [invoices, options] = await Promise.all([
    getInvoices(parsePage(params.page)),
    getInvoiceFormOptions(editingInvoice?.repairAccessOrderId ?? initialPrimaryOrderId)
  ]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <InvoicesView
      key={`${editingInvoice?.id ?? initialPrimaryOrderId ?? "new"}:${editingInvoice?.documentVersion ?? 0}`}
      initialPrimaryOrderId={initialPrimaryOrderId}
      requestId={randomUUID()}
      editingInvoice={editingInvoice}
      canVoid={profile.role === "admin"}
      invoices={invoices.items}
      message={message}
      options={options}
      pagination={invoices.pagination}
    />
  );
}
