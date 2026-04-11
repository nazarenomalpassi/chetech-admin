import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteInvoicePaymentAction } from "@/features/invoices/actions";
import { PrintButton } from "@/features/invoices/components/print-button";
import { getInvoiceById } from "@/features/invoices/queries";
import { getStatusMessage } from "@/lib/form-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function InvoiceDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const message = sp.error ? { success: false, message: sp.error } : getStatusMessage(sp.status);
  let invoice;

  try {
    invoice = await getInvoiceById(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body { background: white !important; }
          aside, nav, .no-print { display: none !important; }
          main, .print-card { box-shadow: none !important; border: none !important; }
        }
      `}</style>
      <div className="no-print flex items-center justify-between">
        <Link className="text-sm font-medium text-brand-700" href="/facturacion">
          Volver a facturacion
        </Link>
        <PrintButton />
      </div>

      {message ? (
        <p className={`no-print rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {message.message}
        </p>
      ) : null}

      <Card className="print-card">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Chetech</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Comprobante interno</h1>
            <p className="mt-2 text-sm text-slate-500">No valido como factura fiscal.</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-2xl font-semibold text-slate-950">{invoice.invoiceNumber}</p>
            <p className="mt-1 text-sm text-slate-500">{formatDate(invoice.createdAt)}</p>
            <Badge className="mt-3" variant={invoice.status === "pagado" ? "success" : invoice.status === "parcial" ? "warning" : invoice.status === "anulado" ? "danger" : "default"}>
              {invoice.status}
            </Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Cliente</p>
            <p className="text-lg font-semibold text-slate-950">{invoice.customerName}</p>
            <p className="text-sm text-slate-600">{invoice.customerPhone || "Sin telefono"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Origen</p>
            <p className="text-lg font-semibold text-slate-950">{invoice.sourceType}</p>
            <p className="text-sm text-slate-600">{invoice.notes || "Sin observaciones"}</p>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Descripcion</th>
                <th className="px-4 py-3 font-medium">Cantidad</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item: any) => (
                <tr className="border-t border-slate-100" key={item.id}>
                  <td className="px-4 py-3 text-slate-700">{item.description}</td>
                  <td className="px-4 py-3 text-slate-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_320px]">
          <div>
            <h2 className="font-semibold text-slate-950">Pagos</h2>
            <div className="mt-3 space-y-2">
              {invoice.payments.length ? (
                invoice.payments.map((payment: any) => (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3" key={payment.id}>
                    <div>
                      <p className="font-medium text-slate-900">{payment.method}</p>
                      <p className="text-xs text-slate-500">{payment.paymentDate} {payment.notes ? `- ${payment.notes}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(payment.amount)}</span>
                      <form action={deleteInvoicePaymentAction} className="no-print">
                        <input name="paymentId" type="hidden" value={payment.id} />
                        <input name="invoiceId" type="hidden" value={invoice.id} />
                        <Button size="sm" type="submit" variant="ghost">Quitar</Button>
                      </form>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin pagos registrados.</p>
              )}
            </div>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5">
            <div className="flex justify-between py-2">
              <span>Subtotal</span>
              <strong>{formatCurrency(invoice.subtotal)}</strong>
            </div>
            <div className="flex justify-between py-2">
              <span>Descuento</span>
              <strong>{formatCurrency(invoice.discount)}</strong>
            </div>
            <div className="flex justify-between py-2">
              <span>Total</span>
              <strong>{formatCurrency(invoice.total)}</strong>
            </div>
            <div className="flex justify-between py-2">
              <span>Pagado</span>
              <strong>{formatCurrency(invoice.paidTotal)}</strong>
            </div>
            <div className="flex justify-between border-t border-slate-200 py-3 text-lg">
              <span>Saldo</span>
              <strong>{formatCurrency(invoice.balance)}</strong>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
