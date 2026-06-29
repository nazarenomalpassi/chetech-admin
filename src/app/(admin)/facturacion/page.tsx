import { InvoicesView } from "@/features/invoices/components/invoices-view";
import { getInvoiceById, getInvoiceFormOptions, getInvoices } from "@/features/invoices/queries";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function FacturacionPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentProfile();
  const [invoices, options, editingInvoice] = await Promise.all([
    getInvoices(),
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
      invoices={invoices}
      message={message}
      options={options}
    />
  );
}
