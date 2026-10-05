import { InvoicesView } from "@/features/invoices/components/invoices-view";
import { getInvoiceById, getInvoiceFormOptions, getInvoices } from "@/features/invoices/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { parsePage } from "@/lib/pagination";

export default async function FacturacionPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; edit?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("invoices.manage");
  const [invoices, options, editingInvoice] = await Promise.all([
    getInvoices(parsePage(params.page)),
    getInvoiceFormOptions(),
    params.edit ? getInvoiceById(params.edit) : Promise.resolve(null)
  ]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <InvoicesView
      editingInvoice={editingInvoice}
      canVoid={profile.role === "admin"}
      invoices={invoices.items}
      message={message}
      options={options}
      pagination={invoices.pagination}
    />
  );
}
