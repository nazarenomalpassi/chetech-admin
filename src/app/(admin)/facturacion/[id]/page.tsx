import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/features/invoices/components/print-button";
import { FiscalInvoicePanel } from "@/features/fiscal";
import { formatInvoiceSource } from "@/features/invoices/labels";
import { getInvoiceById } from "@/features/invoices/queries";
import { getStatusMessage } from "@/lib/form-state";
import { requirePermission } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatCashMethod } from "@/lib/cash";

export default async function InvoiceDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requirePermission("invoices.manage");
  const message = sp.error ? { success: false, message: sp.error } : getStatusMessage(sp.status);
  let invoice;

  try {
    invoice = await getInvoiceById(id);
  } catch {
    notFound();
  }

  return (
    <div className="invoice-page space-y-4">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className="text-sm font-medium text-graphite underline decoration-graphite/30 underline-offset-4" href="/facturacion">
          Volver a facturacion
        </Link>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Link
            className={buttonVariants({ variant: "secondary" })}
            href={`/api/invoices/${invoice.id}/pdf`}
          >
            Descargar PDF
          </Link>
          <PrintButton />
        </div>
      </div>

      {message ? (
        <p className={`no-print rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-brand-100 text-graphite" : "bg-rose-50 text-rose-700"}`}>
          {message.message}
        </p>
      ) : null}

      <Card className="invoice-print-root print-card">
        <div className="invoice-header flex flex-col gap-6 border-b border-slate-100 pb-6 md:flex-row md:items-start md:justify-between">
          <div>
            <img
              alt="Chetech"
              className="h-auto w-44"
              width={176}
              height={52}
              src="/brand/chetech-horizontal-black.svg"
            />
            <h1 className="mt-6 text-3xl font-semibold text-slate-950">Comprobante interno</h1>
            <p className="mt-2 text-sm text-slate-500">No valido como factura fiscal.</p>
          </div>
          <div className="rounded-xl border border-line bg-brand-50 px-4 py-3 text-left md:text-right">
            <p className="text-sm text-slate-600">Documento interno</p>
            <p className="text-2xl font-semibold text-slate-950">{invoice.invoiceNumber}</p>
            <p className="mt-1 text-sm text-slate-500">{formatDate(invoice.createdAt)}</p>
            <Badge className="mt-3" variant={invoice.status === "pagado" ? "success" : invoice.status === "parcial" ? "warning" : invoice.status === "anulado" ? "danger" : "default"}>
              {invoice.status}
            </Badge>
          </div>
        </div>

        {invoice.fiscalReference ? <div className="invoice-section mt-6 rounded-xl border border-line p-4">
          <h2 className="font-semibold">Referencia fiscal externa</h2>
          <p className="mt-2 break-words text-sm">{invoice.fiscalProvider}: {invoice.fiscalReference}</p>
          {invoice.fiscalIssuedAt ? <p className="mt-1 text-sm">Emitida: {formatDate(invoice.fiscalIssuedAt)}</p> : null}
          <p className="mt-2 text-sm text-slate-500">Referencia vinculada. Este documento interno no sustituye ni acredita autorizacion del comprobante fiscal.</p>
        </div> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Cliente</p>
            <p className="text-lg font-semibold text-slate-950">{invoice.customerName}</p>
            <p className="text-sm text-slate-600">{invoice.customerPhone || "Sin telefono"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Origen</p>
            <p className="text-lg font-semibold text-slate-950">{formatInvoiceSource(invoice.sourceType)}</p>
            <p className="text-sm text-slate-600">{invoice.notes || "Sin observaciones"}</p>
          </div>
        </div>

        <div className="invoice-section mt-8 grid gap-3 md:hidden print:hidden">
          {invoice.items.map((item: any) => (
            <article className="rounded-xl border border-line bg-white p-4" key={item.id}>
              <p className="font-semibold text-slate-950">{item.description}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                <div>
                  <span className="text-xs text-slate-400">Cantidad</span>
                  <p className="font-semibold text-slate-800">{item.quantity}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Precio</span>
                  <p className="font-semibold text-slate-800">{formatCurrency(item.unitPrice)}</p>
                </div>
              </div>
              <p className="mt-3 text-right text-lg font-semibold text-slate-950">{formatCurrency(item.total)}</p>
            </article>
          ))}
        </div>

        <div className="invoice-section mt-8 hidden overflow-x-auto md:block print:block">
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
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="invoice-section mt-8 grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold text-slate-950">Operacion registrada</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Emitir o reimprimir este documento no registra dinero ni mueve stock. Los cobros provienen de la operacion vinculada. No es una factura fiscal.
            </p>
            <h3 className="mt-4 font-semibold">Cobros efectivos vinculados</h3>
            {invoice.payments.length ? invoice.payments.map((payment: any) => <p className="mt-2 text-sm" key={`${payment.source}:${payment.id}`}>{formatDate(payment.paymentDate)} / {formatCashMethod(payment.method)} / {formatCurrency(payment.amount)}</p>) : <p className="mt-2 text-sm text-slate-600">Sin cobros efectivos.</p>}
            {invoice.status === "anulado" ? <p className="mt-3 text-sm">Anular el documento no revierte los pagos de la operacion.</p> : null}
          </div>
          <div className="invoice-totals rounded-xl bg-slate-50 p-4 tabular-nums">
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
            <div className="flex justify-between border-t border-slate-200 py-3 text-lg">
              <span>Pagado real</span>
              <strong>{formatCurrency(invoice.paidTotal)}</strong>
            </div>
            <div className="flex justify-between border-t border-slate-200 py-3 text-lg">
              <span>Saldo pendiente</span>
              <strong>{formatCurrency(invoice.balance)}</strong>
            </div>
          </div>
        </div>
      </Card>
      <FiscalInvoicePanel className="no-print" invoiceId={invoice.id} />
    </div>
  );
}
